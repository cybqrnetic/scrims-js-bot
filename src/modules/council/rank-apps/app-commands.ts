import { TimestampStyles, inlineCode, userMention } from "discord.js"
import { DateTime } from "luxon"

import {
    ComponentInteraction,
    LocalizedError,
    LocalizedSlashCommandBuilder,
    MessageOptionsBuilder,
    PositionRole,
    ScrimsBot,
    SlashCommand,
    SlashCommandInteraction,
    UserError,
    Vouch,
} from "lib"

import { COUNCIL_HEAD_PERMISSIONS, HOST_GUILD_ID } from "@Constants"

import { TicketManager } from "@module/tickets"
import { AutoPromoteHandler } from "@module/vouch-system/AutoPromoteHandler"
import { LogUtil } from "@module/vouch-system/LogUtil"
import { VouchUtil } from "@module/vouch-system/VouchUtil"
import { RankAppTicketManager } from "./RankApplications"

function fetchHostMember(resolvable: string) {
    const member =
        ScrimsBot.INSTANCE!.host!.members.resolve(resolvable) ??
        ScrimsBot.INSTANCE!.host!.members.cache.find(
            (m) => m.user.username.toLowerCase() === resolvable.toLowerCase(),
        )

    if (!member)
        throw new UserError(
            `Can't complete this action since ${inlineCode(resolvable)} is not a Bridge Scrims member.`,
        )

    return member
}

SlashCommand({
    builder: new LocalizedSlashCommandBuilder("commands.accept_app").setDMPermission(false),
    config: { permissions: COUNCIL_HEAD_PERMISSIONS, defer: "ephemeral_reply" },
    handler: handleAccept,
})

export async function handleAccept(interaction: ComponentInteraction | SlashCommandInteraction) {
    const { ticket, ticketManager } = await TicketManager.findTicket(interaction)
    if (!(ticketManager instanceof RankAppTicketManager))
        throw new UserError("This command can only be used in rank application channels!")

    if (!interaction.userHasPosition(`${ticketManager.rank} Head`))
        throw new LocalizedError("command_handler.missing_permissions")

    const member = fetchHostMember(ticket.userId)
    const roles = PositionRole.getPermittedRoles(ticketManager.rank, HOST_GUILD_ID)
    await Promise.all(
        roles.map((r) =>
            member.roles.add(r, `Promoted to ${ticketManager.rank} by ${interaction.user.tag}.`),
        ),
    )

    const vouch = await Vouch.create({
        comment: "won vote",
        position: ticketManager.rank,
        userId: ticket.userId,
        worth: 1,
    }).catch(console.error)

    if (vouch) {
        LogUtil.logCreate(vouch, interaction.user).catch(console.error)
        await VouchUtil.removeSimilarVouches(vouch).catch((err) =>
            console.error("Failed to remove similar vouches!", err),
        )
    }

    AutoPromoteHandler.announcePromotion(member.user, ticketManager.rank)

    await interaction.editReply(
        new MessageOptionsBuilder()
            .setContent(`${userMention(ticket.userId)} was promoted.`)
            .setEphemeral(true)
            .removeMentions(),
    )

    await interaction.followUp(
        new MessageOptionsBuilder().setContent("This channel will now be archived...").setEphemeral(true),
    )
    await ticketManager.closeTicket(ticket, interaction.user, "App Accepted")
}

SlashCommand({
    builder: new LocalizedSlashCommandBuilder("commands.deny_app").setDMPermission(false),
    config: { permissions: COUNCIL_HEAD_PERMISSIONS, defer: "ephemeral_reply" },
    handler: handleDeny,
})

export async function handleDeny(interaction: SlashCommandInteraction | ComponentInteraction) {
    const { ticket, ticketManager } = await TicketManager.findTicket(interaction)
    if (!(ticketManager instanceof RankAppTicketManager))
        throw new UserError("This command can only be used in rank application channels!")

    if (!interaction.userHasPosition(`${ticketManager.rank} Head`))
        throw new LocalizedError("command_handler.missing_permissions")

    const vouch = await Vouch.create({
        comment: "lost vote",
        userId: ticket.userId,
        position: ticketManager.rank,
        worth: -1,
    })

    LogUtil.logCreate(vouch, interaction.user).catch(console.error)
    await VouchUtil.removeSimilarVouches(vouch).catch(console.error)

    const cooldown = ticketManager.options.cooldown
    const user = ticket.user()
    const sent = await user
        ?.send(
            `:no_entry_sign: **Your ${ticketManager.rank} application was denied** since you lost your vote.` +
                (cooldown
                    ? ` You can apply again ${DateTime.now()
                          .plus({ seconds: cooldown })
                          .toDiscord(TimestampStyles.RelativeTime)}.`
                    : ""),
        )
        .catch(() => false)

    await interaction.return(
        new MessageOptionsBuilder()
            .setContent(
                `${user} was denied.` +
                    (!sent ? `\n:warning: Couldn't DM the user because of their privacy settings.` : ""),
            )
            .removeMentions(),
    )

    await interaction.followUp(
        new MessageOptionsBuilder().setContent("This channel will now be archived...").setEphemeral(true),
    )
    await ticketManager.closeTicket(ticket, interaction.user, "App Denied")
}
