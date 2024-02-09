import {
    ActionRowBuilder,
    ModalBuilder,
    TextInputStyle,
    TimestampStyles,
    User,
    inlineCode,
    userMention,
} from "discord.js"
import {
    Command,
    CommandHandlerInteraction,
    LocalizedError,
    LocalizedSlashCommandBuilder,
    MessageOptionsBuilder,
    Permissions,
    PositionRole,
    ScrimsBot,
    UserError,
    Vouch,
} from "lib"

import { DateTime } from "luxon"

import { HOST_GUILD_ID, RANKS } from "@Constants"
import { TextInputBuilder } from "discord.js"
import { TicketManager } from "../tickets"
import { AutoPromoteHandler } from "../vouch-system/AutoPromoteHandler"
import LogUtil from "../vouch-system/LogUtil"
import { VouchUtil } from "../vouch-system/VouchUtil"
import { RankAppTicketManager } from "./RankApplications"

export const COUNCIL_HEAD_PERMISSIONS: Permissions = {
    positions: Object.values(RANKS).map((rank) => `${rank} Head`),
}

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

Command({
    builder: new LocalizedSlashCommandBuilder("commands.accept_app").setDMPermission(false),

    config: { permissions: COUNCIL_HEAD_PERMISSIONS, defer: "ephemeral_reply" },
    async handler(interaction) {
        const { ticket, ticketManager } = await TicketManager.findTicket(interaction)
        if (!(ticketManager instanceof RankAppTicketManager))
            throw new Error("Ticket manager should be instance of RankAppTicketManager!")

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
    },
})

Command({
    builder: new LocalizedSlashCommandBuilder("commands.deny_app").setDMPermission(false),

    config: { permissions: COUNCIL_HEAD_PERMISSIONS, defer: "ephemeral_reply" },

    async handler(interaction) {
        const { ticket, ticketManager } = await TicketManager.findTicket(interaction)
        if (!(ticketManager instanceof RankAppTicketManager))
            throw new Error("Ticket manager should be instance of RankAppTicketManager!")

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

        await interaction.editReply(
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
    },
})

Command({
    builder: new LocalizedSlashCommandBuilder("commands.purge").setDMPermission(false),
    config: { permissions: COUNCIL_HEAD_PERMISSIONS },
    async handler(interaction) {
        const reason = new TextInputBuilder()
            .setLabel("Reason")
            .setCustomId("reason")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)

        const users = new TextInputBuilder()
            .setLabel("Users")
            .setCustomId("users")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder("Usernames joined by line breaks e.g.\nwhatcats\ntphere\n...")

        await interaction.showModal(
            new ModalBuilder()
                .setTitle("Council Purge")
                .setCustomId(interaction.path)
                .addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(reason),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(users),
                ),
        )
    },

    async handleModalSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true })

        const components = interaction.components.map((v) => v.components).flat()
        const reason = components.find((v) => v.customId === "reason")!.value
        const users = components.find((v) => v.customId === "users")!.value.split("\n")

        const resolved = new Set<User>()
        const problems: string[] = []
        await Promise.all(
            users.map((user) => {
                purge(interaction, resolved, user, reason).catch((error) => {
                    if (error instanceof UserError) problems.push(error.message)
                    else {
                        console.error(error)
                        problems.push(`Failed to purge ${inlineCode(user)} due to an unexpected error.`)
                    }
                })
            }),
        )

        await interaction.editReply(
            `## Purged ${users.length - problems.length}/${users.length} User(s)` +
                (problems.length
                    ? `\n### Problems:\n${problems.map((v) => `${inlineCode("•")} ${v}`).join("\n")}`
                    : ""),
        )
    },
})

async function purge(
    interaction: CommandHandlerInteraction,
    resolved: Set<User>,
    resolvable: string,
    reason: string,
) {
    const member = fetchHostMember(resolvable)
    const user = member.user

    if (resolved.has(user)) throw new UserError(`Duplicate entry detected for ${user}!`)
    resolved.add(user)

    const rank = VouchUtil.determineDemoteRank(member.user, interaction.user)
    const roles = PositionRole.getPermittedRoles(rank, HOST_GUILD_ID)
    await Promise.all(
        roles.map((r) => member.roles.remove(r, `Demoted from ${rank} by ${interaction.user.tag}.`)),
    )

    const vouch = await Vouch.create({
        comment: reason,
        position: rank,
        userId: user.id,
        worth: -2,
    }).catch(console.error)

    if (vouch) {
        LogUtil.logCreate(vouch, interaction.user).catch(console.error)
        await VouchUtil.removeSimilarVouches(vouch).catch((err) =>
            console.error("Failed to remove similar vouches!", err),
        )
    }

    LogUtil.logDemotion(user, rank, interaction.user).catch(console.error)
    user.send(`**You lost your ${rank} rank in Bridge Scrims for ${reason}.**`).catch(() => null)

    const announcement = new MessageOptionsBuilder().setContent(`**${user} was removed from ${rank}.**`)
    interaction.client
        .buildSendMessages(`${rank} Announcements Channel`, null, announcement)
        .catch(console.error)
}
