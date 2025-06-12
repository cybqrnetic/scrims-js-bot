import {
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    Guild,
    InteractionContextType,
    Message,
    SlashCommandBuilder,
    User,
    userMention,
    type ChatInputCommandInteraction,
    type MessageComponentInteraction,
} from "discord.js"

import { ColorUtil, Component, LocalizedError, MessageOptionsBuilder, SlashCommand, UserError } from "lib"

import { OnlinePositions, PositionRole } from "@module/positions"
import { RankAppExtras, RankAppTicketManager } from "./RankApplications"
import { handleAccept, handleDeny } from "./app-commands"

export type Votes = Record<string, number>
function getVotesValue(votes: Votes) {
    if (Object.keys(votes).length === 0) return 0
    return (
        Object.values(votes)
            .map((v) => (isNaN(v) ? 0 : v))
            .reduce((pv, cv) => pv + cv, 0) / Object.keys(votes).length
    )
}

const VOTE_VALUES = record({
    ":raised_back_of_hand:": 0,
    ":white_check_mark:": 1,
    ":no_entry:": -1,
    ":zzz:": NaN,
})

const VOTE_EMOJIS: Record<number, string> = Object.fromEntries(
    Object.entries(VOTE_VALUES).map(([a, b]) => [b, a]),
)

export class CouncilVoteManager {
    constructor(readonly rank: string) {}

    getPendingVotes() {
        return Object.fromEntries(
            OnlinePositions.getMembersWithPosition(`${this.rank} Council`).map((v) => [v.id, NaN]),
        )
    }

    parseMessageVotes(message: Message): Votes {
        const votes = message.embeds[0]?.description
        if (!votes) return {}
        return Object.fromEntries(
            Array.from(votes.matchAll(/(:.+?:).+?<@(\d+)>/gm))
                .map(([, emoji, userId]) => {
                    const vote = VOTE_VALUES[emoji!]
                    return !vote ? false : [userId, vote]
                })
                .filter((v): v is [string, number] => v !== false),
        )
    }

    buildVoteMessageBase(user: User | null | undefined) {
        const embed = new EmbedBuilder()
        if (user) {
            embed.setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
        }
        return embed
    }

    buildVoteMessage(user: User | null | undefined, guild: Guild, savedVotes: Votes = {}) {
        const votes = { ...this.getPendingVotes(), ...savedVotes }
        return new MessageOptionsBuilder()
            .setContent(PositionRole.getRoles(`${this.rank} Council`, guild.id).join(" "))
            .addEmbeds(
                this.buildVoteMessageBase(user)
                    .setTitle(`${this.rank} Council Vote`)
                    .setColor(PositionRole.getRoles(`${this.rank} Council`, guild.id)?.[0]?.color ?? 0)
                    .setDescription(
                        `${Object.keys(savedVotes).length}/${Object.keys(votes).length} have voted.`,
                    ),
            )
            .addActions(
                this.buildVoteAction(1, "Yes", ButtonStyle.Success),
                this.buildVoteAction(0, "Abs", ButtonStyle.Secondary),
                this.buildVoteAction(-1, "No", ButtonStyle.Danger),
            )
            .addActions(
                new ButtonBuilder()
                    .setCustomId("COUNCIL_EVALUATE")
                    .setLabel("Evaluate Outcome")
                    .setStyle(ButtonStyle.Secondary),
            )
    }

    buildVoteEvalMessage(user: User | null | undefined, guild: Guild, savedVotes: Votes = {}) {
        const votes = { ...this.getPendingVotes(), ...savedVotes }
        return new MessageOptionsBuilder()
            .addEmbeds(
                this.buildVoteMessageBase(user)
                    .setTitle(`${this.rank} Council Vote Eval`)
                    .setColor(ColorUtil.hsvToRgb(getVotesValue(votes) * 60 + 60, 1, 1))
                    .setDescription(
                        Object.entries(votes)
                            .map(([userId, v]) => `${VOTE_EMOJIS[v]} **-** ${userMention(userId)}`)
                            .join("\n") || "No Council",
                    ),
            )
            .addActions(
                this.buildEvalAction("Accept", ButtonStyle.Success),
                this.buildEvalAction("Deny", ButtonStyle.Danger),
            )
    }

    buildVoteAction(value: number, action: string, style: ButtonStyle) {
        return new ButtonBuilder().setCustomId(`COUNCIL_VOTE/${value}`).setLabel(action).setStyle(style)
    }

    buildEvalAction(action: string, style: ButtonStyle) {
        return new ButtonBuilder().setCustomId(`COUNCIL_EVALUATE/${action}`).setLabel(action).setStyle(style)
    }
}

Component({
    builder: "COUNCIL_VOTE",
    async handler(interaction) {
        const { manager, ticket } = await RankAppTicketManager.findTicket<RankAppExtras>(interaction, false)
        if (!(manager instanceof RankAppTicketManager))
            throw new UserError(`This interaction is not available in this channel.`)

        if (!interaction.user.hasPermission(`council.${manager.rank.toLowerCase()}.vote`))
            throw new LocalizedError("command_handler.missing_permissions")

        const vote = parseFloat(interaction.args.shift()!)
        if (isNaN(vote)) throw new Error(`Got invalid vote value of ${vote} from ${interaction.customId}!`)

        await ticket.updateOne({ $set: { [`extras.votes.${interaction.user.id}`]: vote } })

        if (!ticket.extras) ticket.extras = { votes: {} }
        ticket.extras.votes[interaction.user.id] = vote

        await interaction.update(
            manager.vote.buildVoteMessage(ticket.user(), interaction.guild, ticket.extras.votes),
        )
    },
})

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("evaluate")
        .setDescription("Use to evaluate the council vote")
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions("0"),
    handler: handleEvaluate,
})

Component({
    builder: "COUNCIL_EVALUATE",
    handler: handleEvaluate,
})

async function handleEvaluate(
    interaction: MessageComponentInteraction<"cached"> | ChatInputCommandInteraction<"cached">,
) {
    const action = interaction.args.shift()
    switch (action) {
        case "Accept":
            return handleAccept(interaction)
        case "Deny":
            return handleDeny(interaction)
    }

    const { ticket, manager } = await RankAppTicketManager.findTicket<RankAppExtras>(interaction, false)
    if (!(manager instanceof RankAppTicketManager))
        throw new UserError("This command can only be used in rank application channels!")

    if (!interaction.user.hasPermission(`council.${manager.rank.toLowerCase()}.evaluate_vote`))
        throw new LocalizedError("command_handler.missing_permissions")

    await interaction.reply(
        manager.vote
            .buildVoteEvalMessage(ticket.user(), interaction.guild, ticket.extras?.votes)
            .setEphemeral(true),
    )
}
