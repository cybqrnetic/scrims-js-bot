import {
    InteractionContextType,
    TimestampStyles,
    userMention,
    type ChatInputCommandInteraction,
    type MessageComponentInteraction,
    type User,
} from "discord.js"
import { DateTime } from "luxon"

import {
    DiscordBot,
    LocalizedError,
    LocalizedSlashCommandBuilder,
    MessageOptionsBuilder,
    SlashCommand,
    UserError,
} from "lib"

import { HOST_GUILD_ID } from "@Constants"
import { PositionRole } from "@module/positions"
import { TicketManager } from "@module/tickets"
import { Vouch } from "@module/vouch-system"
import { LogUtil } from "../vouches/LogUtil"
import { RankAppTicketManager } from "./RankApplications"

function fetchHostMember(memberId: string) {
    const member = DiscordBot.getInstance().host?.members.cache.get(memberId)
    if (!member)
        throw new UserError(
            `Can't complete this action since ${userMention(memberId)} is not a Bridge Scrims member.`,
        )

    return member
}

async function createVoteRecord(
    userId: string,
    position: string,
    worth: number,
    comment: string,
    executor: User,
) {
    const filter = { userId, position, worth }
    const vouch = await Vouch.findOneAndUpdate(
        {
            givenAt: { $lte: DateTime.now().plus({ days: 7 }).toJSDate() },
            executorId: { $exists: false },
            ...filter,
        },
        { ...filter, comment, givenAt: new Date() },
        { upsert: true, new: true },
    )
    LogUtil.logCreate(vouch!, executor).catch(console.error)
}

SlashCommand({
    builder: new LocalizedSlashCommandBuilder("commands.accept_app")
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions("0"),
    config: { defer: "ephemeral_reply" },
    handler: handleAccept,
})

export async function handleAccept(
    interaction: MessageComponentInteraction<"cached"> | ChatInputCommandInteraction<"cached">,
) {
    const { ticket, ticketManager } = await TicketManager.findTicket(interaction)
    if (!(ticketManager instanceof RankAppTicketManager))
        throw new UserError("This command can only be used in rank application channels!")

    if (!interaction.user.hasPermission(`council.${ticketManager.rank.toLowerCase()}.evaluateVote`))
        throw new LocalizedError("command_handler.missing_permissions")

    const member = fetchHostMember(ticket.userId)
    const roles = PositionRole.getPermittedRoles(ticketManager.rank, HOST_GUILD_ID)
    await Promise.all(
        roles.map((r) =>
            member.roles.add(r, `Promoted to ${ticketManager.rank} by ${interaction.user.tag}.`),
        ),
    )

    await createVoteRecord(ticket.userId, ticketManager.rank, 1, "won vote", interaction.user)
    LogUtil.announcePromotion(member.user, ticketManager.rank)

    await interaction.return(
        new MessageOptionsBuilder()
            .setContent(`${userMention(ticket.userId)} was promoted.`)
            .setEphemeral(true)
            .removeMentions(),
    )

    await interaction.followUp(
        new MessageOptionsBuilder().setContent("This channel will now be archived...").setEphemeral(true),
    )
    await ticketManager.closeTicket(ticket.id, interaction.user.id, "App Accepted")
}

SlashCommand({
    builder: new LocalizedSlashCommandBuilder("commands.deny_app")
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions("0"),
    config: { defer: "ephemeral_reply" },
    handler: handleDeny,
})

export async function handleDeny(
    interaction: MessageComponentInteraction<"cached"> | ChatInputCommandInteraction<"cached">,
) {
    const { ticket, ticketManager } = await TicketManager.findTicket(interaction)
    if (!(ticketManager instanceof RankAppTicketManager))
        throw new UserError("This command can only be used in rank application channels!")

    if (!interaction.user.hasPermission(`council.${ticketManager.rank.toLowerCase()}.evaluateVote`))
        throw new LocalizedError("command_handler.missing_permissions")

    await createVoteRecord(ticket.userId, ticketManager.rank, -1, "lost vote", interaction.user)

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
    await ticketManager.closeTicket(ticket.id, interaction.user.id, "App Denied")
}
