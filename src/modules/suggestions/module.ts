import {
    AuditLogEvent,
    ButtonStyle,
    Channel,
    ChannelType,
    Events,
    Guild,
    GuildEmoji,
    Message,
    MessageType,
    PartialMessage,
    TextChannel,
    User,
    time,
    userMention,
} from "discord.js"

import {
    APICache,
    BotModule,
    Config,
    DiscordUtil,
    DynamicallyConfiguredCollection,
    LocalizedError,
    MessageFloater,
    MessageOptionsBuilder,
    MessageReactionData,
    Suggestion,
} from "lib"

import { Colors, Positions } from "@Constants"
import onReactionUpdate from "./reactions"

export interface MessageRating {
    upVotes: number
    downVotes: number
    toString: () => string
    toJSON: () => string
}

const CHANNEL_CONFIGS = ["Suggestions Channel", "Prime Suggestions Channel"]
const COOLDOWN = 20 * 60 * 1000

Config.declareTypes(CHANNEL_CONFIGS)
const ConfigKeys = Config.declareTypes({
    Log: "Suggestions Log Channel",
    EpicChannel: "Suggestions Epic Channel",
    VoteConst: "Suggestions Vote Const",
    Upvote: "Suggestions Upvote Emoji",
    Downvote: "Suggestions Downvote Emoji",
})

export class SuggestionsModule extends BotModule {
    static ConfigKeys = ConfigKeys

    readonly infoMessages: DynamicallyConfiguredCollection<MessageFloater | null>[] = CHANNEL_CONFIGS.map(
        (configKey) =>
            new DynamicallyConfiguredCollection(
                configKey,
                (config) => this._createInfoMessage(config),
                (floater) => this._removeInfoMessage(floater),
            ),
    )

    readonly messageSuggestions = new APICache<Suggestion>({ max: 100, ttl: 24 * 60 * 60 })

    addListeners() {
        this.bot.on(Events.MessageCreate, (msg) => this.onMessageCreate(msg))
        this.bot.on(Events.MessageDelete, (msg) => this.onMessageDelete(msg))
        this.bot.partialsHandledEvents
            .on(Events.MessageReactionRemove, (r) => this.onReactionUpdate(r))
            .on(Events.MessageReactionAdd, (r) => this.onReactionUpdate(r))
    }

    async onReady() {
        setInterval(() => this.deleteAllOldMessages().catch(console.error), 5 * 60 * 1000)
    }

    async findSuggestionByMessage(messageId: string) {
        const cached = this.messageSuggestions.get(messageId)
        if (cached !== undefined) return cached

        const suggestion = await Suggestion.findOne({ messageId })
        if (suggestion) this.messageSuggestions.set(messageId, suggestion, -1)
        return suggestion
    }

    async findSuggestionById(id: string) {
        const cached = this.messageSuggestions.find((v) => v?.id === id)
        if (cached !== undefined) return cached
        return Suggestion.findOne({ _id: id })
    }

    getInfoMessageFloaters(guildId: string) {
        return this.infoMessages.map((v) => v.get(guildId)).filter((v): v is MessageFloater => !!v)
    }

    async verifyCreate(user: User) {
        const blacklisted = this.bot.permissions.hasPosition(user, Positions.SuggestionsBlacklisted)
        if (blacklisted)
            throw new LocalizedError(
                "suggestions.blacklisted",
                await blacklisted.expiration().then((v) => v && time(v, "R")),
            )

        if (this.bot.permissions.hasPermissions(user, { positionLevel: Positions.TrialSupport })) return true

        const previous = await Suggestion.findOne({ creatorId: user.id }).sort({ createdAt: -1 })
        if (previous && previous.createdAt.valueOf() + COOLDOWN > Date.now())
            throw new LocalizedError(
                "on_cooldown",
                time(Math.floor((previous.createdAt.valueOf() + COOLDOWN) / 1000), "R"),
            )

        return true
    }

    async onMessageCreate(message: Message) {
        if (message.inGuild() && message.type === MessageType.ThreadCreated)
            if (
                CHANNEL_CONFIGS.map((key) => this.bot.getConfigValue(key, message.guildId)).includes(
                    message.channelId,
                )
            )
                await message.delete().catch(() => null)
    }

    async onMessageDelete(message: Message | PartialMessage) {
        if (message.author?.id !== this.bot.user?.id || !message.guild) return

        const auditLog = await message.guild.fetchAuditLogs({ limit: 3, type: AuditLogEvent.MessageDelete })
        const executor = auditLog.entries.find(
            (v) => v.targetId === message.author?.id && v.extra.channel.id === message.channelId,
        )?.executor
        if (!executor) return

        const suggestion = await this.findSuggestionByMessage(message.id)
        if (suggestion) {
            const rating = this.getMessageRating(message as Message<true>)
            await Suggestion.deleteOne({ messageId: message.id })
            await this.logRemove(suggestion, executor, `${rating}`, message)
        }
    }

    async onReactionUpdate(reaction: MessageReactionData) {
        if (reaction.message.author.id !== this.bot.user?.id) return
        if (reaction.user.id === this.bot.user?.id) return
        if (!reaction.inGuild()) return
        await onReactionUpdate(reaction)
    }

    getVoteConst(guildId: string) {
        const voteConst = this.bot.getConfigValue(ConfigKeys.VoteConst, guildId)
        const number = parseInt(voteConst!)
        if (!isNaN(number) && number > 0) return number
        return null
    }

    getVoteEmojis(guild: Guild) {
        return (
            [
                [ConfigKeys.Upvote, "👍"],
                [ConfigKeys.Downvote, "👎"],
            ] as const
        ).map(([key, def]) => guild.emojis.resolve(this.bot.getConfigValue(key, guild.id)!) ?? def)
    }

    getMessageRating(message: Message<true>): MessageRating {
        const [upVote, downVote] = this.getVoteEmojis(message.guild)
        const upVotes = message.reactions.cache.get((upVote as GuildEmoji)?.id ?? upVote)?.count ?? 1
        const downVotes = message.reactions.cache.get((downVote as GuildEmoji)?.id ?? downVote)?.count ?? 1
        const toString = () => `**${upVotes - 1}** ${upVote}   **${downVotes - 1}** ${downVote}`
        return { upVotes, downVotes, toString, toJSON: toString }
    }

    async _createInfoMessage(config: Config) {
        const channel = config.getChannel()
        if (channel?.type !== ChannelType.GuildText) return null
        const message = await channel.send(this.getInfoMessage(channel.guild))
        await this.deleteOldMessages(channel).catch(console.error)
        return new MessageFloater(message, () => this.getInfoMessage(channel.guild))
    }

    _removeInfoMessage(floater: MessageFloater | null) {
        if (floater) floater.destroy()
    }

    getInfoMessage(guild: Guild) {
        return new MessageOptionsBuilder()
            .addEmbeds((embed) =>
                embed
                    .setTitle("Share Your Ideas")
                    .setColor(Colors.Discord)
                    .setDescription(
                        `This is the place where you can submit your great ideas for the ${guild.name} discord. ` +
                            "Just press the button below to get started!",
                    ),
            )
            .addButtons(
                (b) =>
                    b
                        .setLabel("Make a Suggestion")
                        .setCustomId("SuggestionCreate")
                        .setStyle(ButtonStyle.Success)
                        .setEmoji("📢"),
                (b) =>
                    b
                        .setLabel("Delete a Suggestion")
                        .setCustomId("SuggestionDelete")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("🗑️"),
            )
    }

    suggestionChannel(suggestion: Suggestion) {
        return this.bot.channels.cache.get(suggestion.channelId) as TextChannel | undefined
    }

    suggestionMessage(suggestion: Suggestion) {
        return this.suggestionChannel(suggestion)?.messages.cache.get(suggestion.messageId)
    }

    async deleteAllOldMessages() {
        await Promise.all(
            CHANNEL_CONFIGS.map((key) => Object.values(this.bot.getConfig(key)))
                .flat()
                .map(async ({ guildId, value }) => {
                    if (this.bot.guilds.cache.has(guildId))
                        await this.deleteOldMessages(await this.bot.channels.fetch(value).catch(() => null))
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

    async logRemove(
        suggestion: Suggestion,
        executor: User | null,
        rating: string,
        message?: Message | PartialMessage,
    ) {
        const executorIsCreator = executor?.id === suggestion.creatorId
        const msg = executorIsCreator
            ? `Removed their own suggestion with ${rating}.`
            : `Removed a suggestion with ${rating}.`
        await this.bot.buildSendLogMessages(ConfigKeys.Log, [suggestion.guildId], (guild) =>
            new MessageOptionsBuilder()
                .addEmbeds((e) =>
                    e
                        .setAuthor(
                            DiscordUtil.userAsEmbedAuthor(guild.members.resolve(executor!) ?? executor),
                        )
                        .setColor(Colors.BeanRed)
                        .setDescription(msg)
                        .addFields(suggestion.toEmbedField())
                        .setImage(suggestion.imageURL ?? null)
                        .setFooter({
                            text: `Suggestion from #${this.suggestionChannel(suggestion)?.name}`,
                        }),
                )
                .setContent(executor?.toString()),
        )
    }

    async logCreate(suggestion: Suggestion, message: Message) {
        const count = await Suggestion.countDocuments({ creatorId: suggestion.creatorId })
        const msg = `Created their ${count}. suggestion.`
        await this.bot.buildSendLogMessages(ConfigKeys.Log, [suggestion.guildId], (guild) =>
            new MessageOptionsBuilder()
                .addEmbeds((e) =>
                    e
                        .setAuthor(DiscordUtil.userAsEmbedAuthor(guild.members.resolve(suggestion.creatorId)))
                        .setColor(Colors.BrightSeaGreen)
                        .setDescription(msg)
                        .addFields(suggestion.toEmbedField())
                        .setImage(suggestion.imageURL ?? null)
                        .setFooter({
                            text: `Suggested in #${this.suggestionChannel(suggestion)?.name}`,
                        }),
                )
                .setContent(userMention(suggestion.creatorId)),
        )
    }

    async logDetach(suggestion: Suggestion, executor: User, imageURL: string) {
        const msg = `Removed the image from a suggestion created by ${userMention(suggestion.creatorId)}!`
        await this.bot.buildSendLogMessages(ConfigKeys.Log, [suggestion.guildId], (guild) =>
            new MessageOptionsBuilder()
                .addEmbeds((e) =>
                    e
                        .setAuthor(DiscordUtil.userAsEmbedAuthor(guild.members.resolve(executor) ?? executor))
                        .setColor(Colors.DullRed)
                        .setDescription(msg)
                        .setImage(imageURL)
                        .setFooter({
                            text: `Suggestion from #${this.suggestionChannel(suggestion)?.name}`,
                        }),
                )
                .setContent(`${executor}`),
        )
    }
}

export default SuggestionsModule.getInstance()
