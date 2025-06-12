import {
    SlashCommandBuilder,
    TimestampStyles,
    userMention,
    type ChatInputCommandInteraction,
    type MessageComponentInteraction,
    type User,
} from "discord.js"
import { DateTime } from "luxon"

import { getMainGuild, LocalizedError, MessageOptionsBuilder, SlashCommand, UserError } from "lib"

import { MAIN_GUILD_ID, RANKS } from "@Constants"
import { PositionRole } from "@module/positions"
import { OfflinePositions } from "@module/sticky-roles"
import { TicketManager } from "@module/tickets"
import { Vouch } from "@module/vouch-system"
import { LogUtil } from "../vouches/LogUtil"
import { RankAppTicketManager } from "./RankApplications"

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
    LogUtil.logCreate(vouch, executor)
}

SlashCommand({
    builder: new SlashCommandBuilder().setLocalizations("commands.accept_app"),
    config: { defer: "EphemeralReply", permission: "council.app_commands" },
    handler: handleAccept,
})

export async function handleAccept(
    interaction: MessageComponentInteraction<"cached"> | ChatInputCommandInteraction<"cached">,
) {
    const { ticket, manager } = await TicketManager.findTicket(interaction, false)
    if (!(manager instanceof RankAppTicketManager))
        throw new UserError("This command can only be used in rank application channels!")

    if (!interaction.user.hasPermission(`council.${manager.rank.toLowerCase()}.accept_app`))
        throw new LocalizedError("command_handler.missing_permissions")

    await promote(ticket.userId, manager.rank, "won vote", interaction.user)

    await interaction.return(
        new MessageOptionsBuilder()
            .setContent(`${userMention(ticket.userId)} was promoted.`)
            .setEphemeral(true)
            .removeMentions(),
    )

    await interaction.followUp(
        new MessageOptionsBuilder().setContent("This channel will now be archived...").setEphemeral(true),
    )

    await manager.closeTicket(ticket._id, interaction.user.id, "App Accepted")
}

function determinePromoteRank(user: User) {
    for (const rank of Object.values(RANKS)) {
        if (!OfflinePositions.hasPosition(user, rank)) {
            return rank
        }
    }

    throw new UserError(`${user} can't be promoted any further!`)
}

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("promote")
        .setDescription("Promote a user to the next rank.")
        .addUserOption((option) =>
            option.setName("user").setDescription("The user to promote").setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("The reason for the promotion").setRequired(true),
        ),

    config: { defer: "EphemeralReply", permission: "commands.promote" },

    async handler(interaction) {
        const user = interaction.options.getUser("user", true)
        const reason = interaction.options.getString("reason", true)
        const rank = determinePromoteRank(user)

        if (!interaction.user.hasPermission(`council.${rank.toLowerCase()}.promote`, false))
            throw new UserError(`You are missing the required permission to promote ${user} to ${rank}.`)

        await promote(user.id, rank, reason, interaction.user)
        await interaction.editReply(`${user} was promoted.`)
    },
})

async function promote(userId: string, rank: string, reason: string, executor: User) {
    const member = await getMainGuild()?.members.fetch(userId)
    if (!member)
        throw new UserError(
            `Can't complete this action since ${userMention(userId)} is not a Bridge Scrims member.`,
        )

    const roles = PositionRole.getPermittedRoles(rank, MAIN_GUILD_ID)
    await Promise.all(roles.map((r) => member.roles.add(r, `Promoted to ${rank} by ${executor.tag}.`)))

    await createVoteRecord(userId, rank, 1, reason, executor)
    LogUtil.announcePromotion(member.user, rank)
}

SlashCommand({
    builder: new SlashCommandBuilder().setLocalizations("commands.deny_app"),
    config: { defer: "EphemeralReply", permission: "council.app_commands" },
    handler: handleDeny,
})

export async function handleDeny(
    interaction: MessageComponentInteraction<"cached"> | ChatInputCommandInteraction<"cached">,
) {
    const { ticket, manager } = await TicketManager.findTicket(interaction, false)
    if (!(manager instanceof RankAppTicketManager))
        throw new UserError("This command can only be used in rank application channels!")

    if (!interaction.user.hasPermission(`council.${manager.rank.toLowerCase()}.deny_app`))
        throw new LocalizedError("command_handler.missing_permissions")

    await createVoteRecord(ticket.userId, manager.rank, -1, "lost vote", interaction.user)

    const cooldown = manager.options.cooldown
    const user = ticket.user()
    const sent = await user
        ?.send(
            `:no_entry_sign: **Your ${manager.rank} application was denied** since you lost your vote.` +
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
    await manager.closeTicket(ticket._id, interaction.user.id, "App Denied")
}
