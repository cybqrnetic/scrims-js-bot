import {
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    TimestampStyles,
    inlineCode,
    userMention,
} from "discord.js"

import { DateTime } from "luxon"

import {
    CommandHandlerInteraction,
    ComponentInteraction,
    LocalizedError,
    LocalizedSlashCommandBuilder,
    MessageOptionsBuilder,
    Permissions,
    PositionRole,
    ScrimsBot,
    SlashCommand,
    SlashCommandInteraction,
    UserError,
    UserProfile,
    Vouch,
} from "lib"

import { HOST_GUILD_ID, RANKS } from "@Constants"

import { TicketManager } from "../tickets"
import { AutoPromoteHandler } from "../vouch-system/internal/AutoPromoteHandler"
import LogUtil from "../vouch-system/internal/LogUtil"
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

SlashCommand({
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
            .setPlaceholder(
                "Discord names or IDs joined by line breaks e.g.\nwhatcats\n977686340412006450\n...",
            )

        const rank = new TextInputBuilder()
            .setLabel("Rank")
            .setCustomId("rank")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder("Pristine, Prime, Private or Premium")

        await interaction.showModal(
            new ModalBuilder()
                .setTitle("Council Purge")
                .setCustomId(interaction.path)
                .addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(reason),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(users),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(rank),
                ),
        )
    },

    async handleModalSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true })

        const components = interaction.components.map((v) => v.components).flat()
        const reason = components.find((v) => v.customId === "reason")!.value
        const users = components.find((v) => v.customId === "users")!.value.split("\n")
        const rank = components.find((v) => v.customId === "rank")?.value.toLowerCase()

        const resolved = new Set<UserProfile>()
        const problems: string[] = []
        const warnings: string[] = []

        await Promise.all(
            users.map((user) => {
                purge(interaction, resolved, user, reason, rank)
                    .then((warning) => {
                        if (warning) warnings.push(warning)
                    })
                    .catch((error) => {
                        if (error instanceof UserError) problems.push(error.message)
                        else {
                            console.error(error)
                            problems.push(`Failed to purge ${inlineCode(user)} due to an unexpected error.`)
                        }
                    })
            }),
        )

        let content = `## Purged ${users.length - problems.length}/${users.length} User(s)`

        if (problems.length) content += `\n### Problems:`
        for (const problem of problems) {
            const append = `\n- ${problem}`
            if (append.length + content.length > 2000) break
            content += append
        }

        if (content.length < 2000) {
            if (warnings.length) content += `\n### Warnings:`
            for (const warning of warnings) {
                const append = `\n- ${warning}`
                if (append.length + content.length > 2000) break
                content += append
            }
        }

        await interaction.editReply(content)
    },
})

async function purge(
    interaction: CommandHandlerInteraction,
    resolved: Set<UserProfile>,
    resolvable: string,
    reason: string,
    rankInput: string | undefined,
): Promise<string | void> {
    const user = UserProfile.resolve(resolvable)
    if (!user) throw new UserError(`User couldn't be resolved from '${resolvable}'.`)

    if (resolved.has(user)) return `Duplicate entry detected for ${user}!`
    resolved.add(user)

    const rank = VouchUtil.determineDemoteRank(user, interaction.user)
    if (rankInput && rank.toLowerCase() !== rankInput) {
        return `${user} is wrong rank for purge (${rank}).`
    }

    const removeReason = `Demoted from ${rank} by ${interaction.user.tag}.`
    await interaction.client.permissions.removePosition(user, rank, removeReason)

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
    const dm = await interaction.client.users.createDM(user.id).catch(() => null)
    if (dm != null) dm.send(`**You lost your ${rank} rank in Bridge Scrims for ${reason}.**`)

    const announcement = new MessageOptionsBuilder().setContent(`**${user} was removed from ${rank}.**`)
    interaction.client
        .buildSendMessages(`${rank} Announcements Channel`, null, announcement)
        .catch(console.error)
}
