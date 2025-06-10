import {
    ButtonBuilder,
    ButtonStyle,
    GuildTextBasedChannel,
    PermissionFlagsBits,
    SlashCommandBuilder,
    User,
} from "discord.js"
import { ColorUtil, Component, MessageOptionsBuilder, SlashCommand, UserError, redis } from "lib"
import { DateTime } from "luxon"

import { RANKS } from "@Constants"
import { Config } from "@module/config"

const EXPIRATION = 30 * 24 * 60 * 60

const VOTE_EMOJIS = record({
    "1": ":white_check_mark:",
    "0": ":raised_back_of_hand:",
    "-1": ":no_entry:",
})

const voteChannels = new Map<string, string>()

for (const rank in RANKS) {
    const type = `${rank} Vote Channel`
    Config.declareType(type)
    Config.onCache("add", type, (config) => voteChannels.set(config.value, rank))
    Config.onCache("delete", type, (config) => voteChannels.delete(config.value))
}

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("vote")
        .setDescription("Create an anonymous vote")
        .addStringOption((option) =>
            option.setName("title").setDescription("Title of the vote").setMaxLength(100).setRequired(true),
        )
        .setDefaultMemberPermissions("0"),

    config: { defer: "EphemeralReply" },

    async handler(interaction) {
        const title = interaction.options.getString("title", true)
        const channel = interaction.channel as GuildTextBasedChannel

        const rank = voteChannels.get(interaction.channelId)
        if (rank && !interaction.user.hasPermission(`council.${rank.toLowerCase()}.createVote`))
            throw new UserError(`You are not allow to create ${rank} votes.`)

        const message = getVoteMessage(title, 0)
        if (!channel.permissionsFor(interaction.member, true).has(PermissionFlagsBits.MentionEveryone))
            message.removeMentions()

        const sent = await channel.send(message)
        try {
            const key = `vote:${sent.id}`
            await Promise.all([
                redis.hSet(key, "channel", channel.id),
                redis.hSet(key, "creator", interaction.member.id),
                redis.hSet(key, "title", title),
                redis.expire(key, EXPIRATION),
            ])
        } catch (error) {
            sent.delete().catch(console.error)
            throw error
        }

        await interaction.editReply("Vote created.")
    },
})

Component({
    builder: "VOTE",
    async handler(interaction) {
        const key = `vote:${interaction.message.id}`
        const val = interaction.args.shift()!

        if (!(await redis.exists(key))) throw new UserError("This vote expired.")

        const rank = voteChannels.get(interaction.channelId)
        if (rank && !interaction.user.hasPermission(`council.${rank.toLowerCase()}.vote`))
            throw new UserError(`You are not allow to participate in ${rank} votes.`)

        const [vote] = await Promise.all([
            redis.hGetAll(key),
            redis.hSet(key, interaction.member.id, val),
            redis.expire(key, EXPIRATION),
        ])

        vote[interaction.member.id] = val

        const count = Object.keys(vote).filter((id) => interaction.client.users.cache.has(id)).length
        await interaction.update(getVoteMessage(vote["title"] as string, count))
    },
})

Component({
    builder: "VOTE_EVALUATE",
    async handler(interaction) {
        const key = `vote:${interaction.message.id}`
        const [vote] = await Promise.all([redis.hGetAll(key), redis.expire(key, EXPIRATION)])
        if (Object.keys(vote).length === 0) throw new UserError("This vote expired.")

        const rank = voteChannels.get(interaction.channelId)
        if (rank) {
            if (!interaction.user.hasPermission(`council.${rank.toLowerCase()}.evaluate_vote`))
                throw new UserError(`You are not allow to view ${rank} vote outcomes.`)
        } else if (vote["creator"] !== interaction.member.id) {
            throw new UserError("Only the person who created this vote can view the outcome!")
        }

        const votes: [User, string][] = []
        const voteValues: number[] = []

        Object.entries(vote).forEach(([id, v]) => {
            const user = interaction.client.users.cache.get(id)
            if (user) {
                votes.push([user, v])
                voteValues.push(parseFloat(v))
            }
        })

        await interaction.reply(
            new MessageOptionsBuilder()
                .addEmbeds((embed) =>
                    embed
                        .setAuthor({ name: "Anonymous Vote Eval" })
                        .setTitle(vote["title"] as string)
                        .setColor(ColorUtil.hsvToRgb(getVotesValue(voteValues) * 60 + 60, 1, 1))
                        .setDescription(
                            votes.map(([user, v]) => `${VOTE_EMOJIS[v]} **-** ${user}`).join("\n") ||
                                "No Votes",
                        ),
                )
                .setEphemeral(true),
        )
    },
})

function getVotesValue(votes: number[]) {
    if (votes.length === 0) return 0
    return votes.map((v) => (isNaN(v) ? 0 : v)).reduce((pv, cv) => pv + cv, 0) / votes.length
}

function getVoteMessage(title: string, voted: number) {
    const expiration = DateTime.now().plus({ seconds: EXPIRATION }).toDiscord("R")
    return new MessageOptionsBuilder()
        .setContent(`# ${title}\n${voted} people have voted\n\n*Expires ${expiration}*`)
        .addActions(
            buildVoteAction(1, "Yes", ButtonStyle.Success),
            buildVoteAction(0, "Abs", ButtonStyle.Secondary),
            buildVoteAction(-1, "No", ButtonStyle.Danger),
        )
        .addActions(
            new ButtonBuilder()
                .setCustomId("VOTE_EVALUATE")
                .setLabel("Evaluate Outcome")
                .setStyle(ButtonStyle.Secondary),
        )
}

function buildVoteAction(value: number, action: string, style: ButtonStyle) {
    return new ButtonBuilder().setCustomId(`VOTE/${value}`).setLabel(action).setStyle(style)
}
