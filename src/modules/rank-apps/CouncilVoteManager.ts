import { ButtonBuilder, ButtonStyle, Guild, Message, User } from "discord.js"
import {
    ColorUtil,
    Command,
    LocalizedError,
    MessageOptionsBuilder,
    PositionRole,
    ScrimsBot,
    UserError,
} from "lib"

import { RankAppTicketManager } from "./RankApplications"

const VOTE_VALUE: Record<string, number> = {
    Abstain: 0,
    Yes: 1,
    No: -1,
    Pending: 0,
}

export type Votes = Record<string, string>
function getVotesValue(votes: Votes) {
    if (Object.keys(votes).length === 0) return 0
    return (
        Object.values(votes)
            .map((v) => VOTE_VALUE[v] ?? 0)
            .reduce((pv, cv) => pv + cv, 0) / Object.keys(votes).length
    )
}

const VOTE_SYMBOL: Record<string, string> = {
    Abstain: ":raised_back_of_hand:",
    Yes: ":white_check_mark:",
    No: ":no_entry:",
    Pending: ":zzz:",
}

export class CouncilVoteManager {
    constructor(readonly rank: string) {}

    getPendingVotes(guild: Guild) {
        return Object.fromEntries(
            guild.members.cache
                .filter((v) => ScrimsBot.INSTANCE?.permissions.hasPosition(v, `${this.rank} Council`))
                .map((v) => [v.id, "Pending"]),
        )
    }

    parseMessageVotes(message: Message): Votes {
        const votes = message.embeds[0]?.description
        if (!votes) return {}
        return Object.fromEntries(
            Array.from(votes.matchAll(/(:.+?:).+?<@(\d+)>/gm))
                .map(([_, emoji, userId]) => {
                    const vote = Object.entries(VOTE_SYMBOL).find(([_, v]) => v === emoji)?.[0]
                    return !vote ? false : [userId, vote]
                })
                .filter((v): v is [string, string] => v !== false),
        )
    }

    buildVoteMessage(user: User, guild: Guild, votes: Votes = {}) {
        votes = { ...this.getPendingVotes(guild), ...votes }
        return new MessageOptionsBuilder()
            .setContent(PositionRole.getRoles(`${this.rank} Council`, guild.id).join(" "))
            .addEmbeds((embed) =>
                embed
                    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
                    .setTitle(`${this.rank} Council Vote`)
                    .setColor(ColorUtil.hsvToRgb(getVotesValue(votes) * 60 + 60, 1, 1))
                    .setDescription(
                        Object.entries(votes)
                            .map(([userId, v]) => `${VOTE_SYMBOL[v]} **-** <@${userId}>`)
                            .join("\n") || "No Council",
                    ),
            )
            .addActions(
                this.buildVoteAction(1, "Yes", ButtonStyle.Success),
                this.buildVoteAction(0, "Abs", ButtonStyle.Secondary),
                this.buildVoteAction(-1, "No", ButtonStyle.Danger),
            )
    }

    parseVote(val: string) {
        const parsed = parseFloat(val)
        if (!isNaN(parsed)) {
            const vote = Object.entries(VOTE_VALUE).find(([_, v]) => v === parsed)?.[0]
            if (!vote) console.error(`RankApplications: Unknown Vote '${parsed}'!`, VOTE_VALUE)
            return vote
        }
    }

    buildVoteAction(value: number, action: string, style: ButtonStyle) {
        return new ButtonBuilder().setCustomId(`COUNCIL_VOTE/${value}`).setLabel(action).setStyle(style)
    }
}

Command({
    builder: "COUNCIL_VOTE",
    config: { forceGuild: true },

    async handler(interaction) {
        const { ticketManager, ticket } = await RankAppTicketManager.findTicket(interaction)
        if (!(ticketManager instanceof RankAppTicketManager))
            throw new Error(`${interaction.customId} in non RankAppTicketManager channel!`)

        if (!interaction.userHasPosition(`${ticketManager.rank} Council`))
            throw new LocalizedError("command_handler.missing_permissions")

        const votes = ticketManager.vote.parseMessageVotes(interaction.message)
        const vote = ticketManager.vote.parseVote(interaction.args.shift()!)

        if (!vote) throw new Error(`Got invalid vote value of ${vote} from ${interaction.customId}!`)
        if (!ticket.user()) throw new UserError("The applicant left the server.")

        votes[interaction.user.id] = vote
        await interaction.update(
            ticketManager.vote.buildVoteMessage(ticket.user()!, interaction.guild!, votes),
        )
    },
})
