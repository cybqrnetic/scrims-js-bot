import {
    AuditLogEvent,
    ButtonStyle,
    Channel,
    Events,
    Guild,
    GuildEmoji,
    Message,
    MessageReaction,
    MessageType,
    PartialMessage,
    PartialMessageReaction,
    PartialUser,
    User,
    userMention,
} from "discord.js"

import { APICache, bot, BotModule, DiscordUtil, MessageFloater, MessageOptionsBuilder } from "lib"

import { Colors } from "@Constants"
import { Config, DynamicallyCreatedCollection } from "@module/config"
import { Suggestion } from "./Suggestion"
import { CREATE_SUGGESTION } from "./create"
import { DELETE_SUGGESTION } from "./delete"
import onReactionUpdate from "./reactions"

export interface MessageRating {
    upVotes: number
    downVotes: number
    toString: () => string
}

const CHANNEL_CONFIGS = ["Suggestions Channel", "Prime Suggestions Channel"]
Config.declareTypes(CHANNEL_CONFIGS)

const channels = new Set()
CHANNEL_CONFIGS.map((key) => {
    Config.onCache("add", key, (config) => channels.add(config.value))
    Config.onCache("delete", key, (config) => channels.delete(config.value))
})

export const ConfigKeys = Config.declareTypes({
    Log: "Suggestions Log Channel",
    EpicChannel: "Suggestions Epic Channel",
    VoteConst: "Suggestions Vote Const",
    Upvote: "Suggestions Upvote Emoji",
    Downvote: "Suggestions Downvote Emoji",
})

export class SuggestionsModule extends BotModule {
    readonly infoMessages = CHANNEL_CONFIGS.map((configKey) =>
        DynamicallyCreatedCollection(
            configKey,
            (config) => this.createInfoMessage(config),
            (floater) => this.removeInfoMessage(floater),
        ),
    )

    readonly messageSuggestions = new APICache<Suggestion | null>({ max: 100, ttl: 24 * 60 * 60 })

    addListeners() {
        this.bot.on(Events.MessageCreate, (msg) => this.onMessageCreate(msg))
        this.bot.on(Events.MessageDelete, (msg) => this.onMessageDelete(msg))
        this.bot.on(Events.MessageReactionAdd, (r, user) => this.onReactionUpdate(r, user))
        this.bot.on(Events.MessageReactionRemove, (r, user) => this.onReactionUpdate(r, user))
    }

    onReady() {
        setInterval(() => this.deleteAllOldMessages().catch(console.error), 5 * 60 * 1000)
    }

    async findSuggestionByMessage(messageId: string) {
        const cached = this.messageSuggestions.get(messageId)
        if (cached !== undefined) return cached

        const suggestion = await Suggestion.findOne({ messageId })
        this.messageSuggestions.set(messageId, suggestion)
        return suggestion
    }

    getInfoMessageFloaters(guildId: string) {
        return this.infoMessages.map((v) => v.get(guildId)).filter((v): v is MessageFloater => !!v)
    }

    async onMessageCreate(message: Message) {
        if (message.inGuild() && message.type === MessageType.ThreadCreated) {
            await Config.cache.initialized()
            if (channels.has(message.channelId)) {
                await message.delete().catch(() => null)
            }
        }
    }

    async onMessageDelete(message: Message | PartialMessage) {
        if (!message.author || !message.guild || message.author.id !== this.bot.user?.id) return

        const log = await message.guild.fetchAuditLogs({ limit: 3, type: AuditLogEvent.MessageDelete })
        const executor = log.entries.find(
            (v) => v.targetId === message.author?.id && v.extra.channel.id === message.channelId,
        )?.executor
        if (!executor) return

        const suggestion = await this.findSuggestionByMessage(message.id)
        if (suggestion) {
            const rating = this.getMessageRating(message as Message<true>)
            await Suggestion.deleteOne({ messageId: message.id })
            this.messageSuggestions.delete(message.id)
            this.logRemove(suggestion, await executor.fetch(), `${rating}`)
        }
    }

    async onReactionUpdate(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
        if (reaction.message.author?.id !== this.bot.user?.id) return
        if (user.id === this.bot.user?.id) return
        if (!reaction.message.inGuild()) return
        await onReactionUpdate(this, reaction)
    }

    getVoteConst(guildId: string) {
        const voteConst = Config.getConfigValue(ConfigKeys.VoteConst, guildId)
        const number = parseInt(voteConst!)
        return !isNaN(number) && number > 0 ? number : null
    }

    getVoteEmojis(guild: Guild) {
        return (
            [
                [ConfigKeys.Upvote, "👍"],
                [ConfigKeys.Downvote, "👎"],
            ] as const
        ).map(([key, def]) => guild.emojis.resolve(Config.getConfigValue(key, guild.id)!) ?? def)
    }

    getMessageRating(message: Message | PartialMessage): MessageRating {
        const [upVote, downVote] = this.getVoteEmojis(message.guild!)
        const upVotes = message.reactions.cache.get((upVote as GuildEmoji)?.id ?? upVote)?.count ?? 1
        const downVotes = message.reactions.cache.get((downVote as GuildEmoji)?.id ?? downVote)?.count || 1
        const toString = () => `**${upVotes - 1}** ${upVote}   **${downVotes - 1}** ${downVote}`
        return { upVotes, downVotes, toString }
    }

    private async createInfoMessage(config: Config) {
        await bot.ready()
        const channel = config.getChannel()
        if (!channel?.isTextBased()) {
            console.warn(`Misconfigured suggestions channel ${config.type}: ${config.value}`)
            return
        }

        const message = await channel.send(this.getInfoMessage(channel.guild))
        await this.deleteOldMessages(channel).catch(console.error)
        return new MessageFloater(message, () => this.getInfoMessage(channel.guild))
    }

    private removeInfoMessage(floater?: MessageFloater) {
        if (floater) floater.destroy()
    }

    getInfoMessage(guild: Guild) {
        return new MessageOptionsBuilder()
            .addEmbeds((embed) =>
                embed
                    .setTitle("Share Your Ideas")
                    .setColor(Colors.Discord)
                    .setDescription(
                        `This is the place where you can submit your great ideas for the ${guild.name} Discord. ` +
                            "Just press the button below to get started!",
                    ),
            )
            .addButtons(
                (button) =>
                    button
                        .setLabel("Make a Suggestion")
                        .setCustomId(CREATE_SUGGESTION)
                        .setStyle(ButtonStyle.Success)
                        .setEmoji("📢"),
                (button) =>
                    button
                        .setLabel("Delete a Suggestion")
                        .setCustomId(DELETE_SUGGESTION)
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("🗑️"),
            )
    }

    async deleteAllOldMessages() {
        await Config.cache.initialized()
        await Promise.all(
            CHANNEL_CONFIGS.map((key) => Object.values(Config.getConfig(key)))
                .flat()
                .map(async ({ guildId, value }) => {
                    const guild = this.bot.guilds.cache.get(guildId)
                    if (guild) {
                        await this.deleteOldMessages(await guild.channels.fetch(value).catch(() => null))
                    }
                }),
        )
    }

    async deleteOldMessages(channel: Channel | null) {
        try {
            if (channel?.isTextBased()) {
                const messages = await channel.messages.fetch({ limit: 10 })
                messages.sort((a, b) => b.createdTimestamp - a.createdTimestamp)
                await Promise.all(
                    [...messages.values()]
                        .filter((msg) => msg.components.length > 0 && msg.author.id === this.bot.user?.id)
                        .slice(1)
                        .map((msg) => msg.delete()),
                )
            }
        } catch (err) {
            console.debugError(err)
        }
    }

    logRemove(suggestion: Suggestion, executor: User | null, rating: string) {
        const executorIsCreator = executor?.id === suggestion.creatorId
        const msg = executorIsCreator
            ? `Removed their own suggestion with ${rating}.`
            : `Removed a suggestion with ${rating}.`

        Config.buildSendLogMessages(ConfigKeys.Log, [suggestion.guildId], (guild) =>
            new MessageOptionsBuilder()
                .addEmbeds((embed) =>
                    embed
                        .setAuthor(
                            DiscordUtil.userAsEmbedAuthor(guild.members.resolve(executor!) ?? executor),
                        )
                        .setColor(Colors.BeanRed)
                        .setDescription(msg)
                        .addFields(suggestion.toEmbedField())
                        .setImage(suggestion.imageURL ?? null)
                        .setFooter({
                            text: `Suggestion from #${suggestion.channel()?.name}`,
                        }),
                )
                .setContent(executor?.toString()),
        )
    }

    async logCreate(suggestion: Suggestion) {
        const count = await Suggestion.countDocuments({ creatorId: suggestion.creatorId })
        const msg = `Created their ${count}. suggestion.`

        Config.buildSendLogMessages(ConfigKeys.Log, [suggestion.guildId], (guild) =>
            new MessageOptionsBuilder()
                .addEmbeds((embed) =>
                    embed
                        .setAuthor(DiscordUtil.userAsEmbedAuthor(guild.members.resolve(suggestion.creatorId)))
                        .setColor(Colors.BrightSeaGreen)
                        .setDescription(msg)
                        .addFields(suggestion.toEmbedField())
                        .setImage(suggestion.imageURL ?? null)
                        .setFooter({
                            text: `Suggested in #${suggestion.channel()?.name}`,
                        }),
                )
                .setContent(userMention(suggestion.creatorId)),
        )
    }

    logDetach(suggestion: Suggestion, executor: User, imageURL: string) {
        const msg = `Removed the image from a suggestion created by ${userMention(suggestion.creatorId)}!`
        Config.buildSendLogMessages(ConfigKeys.Log, [suggestion.guildId], (guild) =>
            new MessageOptionsBuilder()
                .addEmbeds((embed) =>
                    embed
                        .setAuthor(DiscordUtil.userAsEmbedAuthor(guild.members.resolve(executor) ?? executor))
                        .setColor(Colors.DullRed)
                        .setDescription(msg)
                        .setImage(imageURL)
                        .setFooter({
                            text: `Suggestion from #${suggestion.channel()?.name}`,
                        }),
                )
                .setContent(`${executor}`),
        )
    }
}

export default SuggestionsModule.getInstance()
