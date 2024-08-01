import {
    ButtonBuilder,
    ButtonStyle,
    Guild,
    Message,
    SlashCommandBuilder,
    User,
    userMention,
} from "discord.js"

import {
    ColorUtil,
    Component,
    ComponentInteraction,
    LocalizedError,
    MessageOptionsBuilder,
    PositionRole,
    ScrimsBot,
    SlashCommand,
    SlashCommandInteraction,
    UserError,
} from "lib"

import { COUNCIL_HEAD_PERMISSIONS } from "@Constants"
import { EmbedBuilder } from "discord.js"
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

const VOTE_VALUES: Record<string, number> = {
    ":raised_back_of_hand:": 0,
    ":white_check_mark:": 1,
    ":no_entry:": -1,
    ":zzz:": NaN,
}

const VOTE_EMOJIS: Record<number, string> = Object.fromEntries(
    Object.entries(VOTE_VALUES).map((v) => v.reverse()),
)

export class CouncilVoteManager {
    constructor(readonly rank: string) {}

    getPendingVotes(guild: Guild) {
        return Object.fromEntries(
            guild.members.cache
                .filter((v) => ScrimsBot.INSTANCE?.permissions.hasPosition(v, `${this.rank} Council`))
                .map((v) => [v.id, NaN]),
        )
    }

    parseMessageVotes(message: Message): Votes {
        const votes = message.embeds[0]?.description
        if (!votes) return {}
        return Object.fromEntries(
            Array.from(votes.matchAll(/(:.+?:).+?<@(\d+)>/gm))
                .map(([_, emoji, userId]) => {
                    const vote = VOTE_VALUES[emoji]
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
        const votes = { ...this.getPendingVotes(guild), ...savedVotes }
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
        const votes = { ...this.getPendingVotes(guild), ...savedVotes }
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
        const { ticketManager, ticket } = await RankAppTicketManager.findTicket<RankAppExtras>(interaction)
        if (!(ticketManager instanceof RankAppTicketManager))
            throw new UserError(`This interaction is not available in this channel.`)

        if (!interaction.userHasPosition(`${ticketManager.rank} Council`))
            throw new LocalizedError("command_handler.missing_permissions")

        const vote = parseFloat(interaction.args.shift()!)
        if (isNaN(vote)) throw new Error(`Got invalid vote value of ${vote} from ${interaction.customId}!`)

        await ticket.updateOne({ $set: { [`extras.votes.${interaction.user.id}`]: vote } })

        if (!ticket.extras) ticket.extras = { votes: {} }
        ticket.extras.votes[interaction.user.id] = vote

        await interaction.update(
            ticketManager.vote.buildVoteMessage(ticket.user(), interaction.guild!, ticket.extras.votes),
        )
    },
})

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("evaluate")
        .setDescription("Use to evaluate the council vote")
        .setDMPermission(false),

    config: { permissions: COUNCIL_HEAD_PERMISSIONS },
    handler: handleEvaluate,
})

Component({
    builder: "COUNCIL_EVALUATE",
    config: { permissions: COUNCIL_HEAD_PERMISSIONS },
    handler: handleEvaluate,
})

async function handleEvaluate(interaction: ComponentInteraction | SlashCommandInteraction) {
    const action = interaction.args.shift()
    switch (action) {
        case "Accept":
            return handleAccept(interaction)
        case "Deny":
            return handleDeny(interaction)
    }

    const { ticket, ticketManager } = await RankAppTicketManager.findTicket<RankAppExtras>(interaction)
    if (!(ticketManager instanceof RankAppTicketManager))
        throw new UserError("This command can only be used in rank application channels!")

    if (!interaction.userHasPosition(`${ticketManager.rank} Head`))
        throw new LocalizedError("command_handler.missing_permissions")

    await interaction.reply(
        ticketManager.vote
            .buildVoteEvalMessage(ticket.user(), interaction.guild!, ticket.extras?.votes)
            .setEphemeral(true),
    )
}
