import { DocumentType, Prop } from "@typegoose/typegoose"
import { messageLink, type Guild } from "discord.js"

import { Document, MessageOptionsBuilder, bot, modelClassCached } from "lib"
import { Types } from "mongoose"

const mapped = new Map<string, Map<string, Config>>()
const declaredTypes = new Set<string>()

@Document("Config", "config")
class ConfigClass {
    static declareTypes<T extends Record<string, string> | string[]>(types: T): T {
        if (Array.isArray(types)) types.forEach((type) => declaredTypes.add(type))
        else Object.values(types).forEach((type) => declaredTypes.add(type))
        return types
    }

    static declareType<T extends string>(type: T): T {
        declaredTypes.add(type)
        return type
    }

    static declaredTypes() {
        return declaredTypes
    }

    static getConfigValue(key: string, guildId: string, def: string): string
    static getConfigValue(key: string, guildId: string, def?: string): string | undefined
    static getConfigValue(key: string, guildId: string, def?: string) {
        return mapped.get(key)?.get(guildId)?.value ?? def
    }

    static getConfig(type: string) {
        return Array.from(mapped.get(type)?.values() ?? [])
    }

    static onCache(event: "add" | "delete", type: string, listener: (doc: Config) => unknown) {
        Config.cache.on(event, (doc) => {
            if (doc.type === type) {
                return listener(doc)
            }
        })
        return this
    }

    static buildSendLogMessages(
        configKey: string,
        guilds: string[] | null | undefined,
        builder: ((guild: Guild) => MessageOptionsBuilder | void) | MessageOptionsBuilder,
    ) {
        this._buildSendMessages(configKey, guilds, builder, true).catch(console.debugError)
    }

    static buildSendMessages(
        configKey: string,
        guilds: string[] | null | undefined,
        builder: ((guild: Guild) => MessageOptionsBuilder | void) | MessageOptionsBuilder,
        removeMentions?: boolean,
    ) {
        this._buildSendMessages(configKey, guilds, builder, removeMentions).catch(console.debugError)
    }

    private static async _buildSendMessages(
        configKey: string,
        guilds: string[] | null | undefined,
        builder: ((guild: Guild) => MessageOptionsBuilder | void) | MessageOptionsBuilder,
        removeMentions?: boolean,
    ) {
        await bot.ready()
        await Config.cache.initialized()

        if (!guilds) {
            guilds = Array.from(bot.guilds.cache.keys())
        }

        for (const guildId of guilds) {
            const guild = bot.guilds.resolve(guildId)
            if (guild) {
                const payload = typeof builder === "function" ? builder(guild) : builder
                if (payload) {
                    if (removeMentions) payload.removeMentions()
                    const channelId = this.getConfigValue(configKey, guild.id)
                    if (channelId) {
                        guild.channels
                            .fetch(channelId)
                            .then((channel) => (channel?.isTextBased() ? channel.send(payload) : null))
                            .catch(console.debugError)
                    }
                }
            }
        }
    }

    @Prop({ required: true })
    type!: string

    @Prop({ type: Types.Long, required: true })
    guildId!: string

    @Prop({ required: true })
    value!: string

    guild() {
        return bot.guilds.cache.get(this.guildId)
    }

    getMessage() {
        if (this.value?.includes("-")) {
            const [channelId, messageId] = this.value.split("-")
            const channel = this.guild()?.channels.cache.get(channelId!)
            if (channel?.isTextBased()) return channel.messages.cache.get(messageId!)
        }
    }

    getChannel() {
        return this.guild()?.channels.cache.get(this.value)
    }

    getRole() {
        return this.guild()?.roles.cache.get(this.value)
    }

    asArray() {
        return this.value
            .split(",")
            .map((value) => value.trim())
            .map((value) => new Config({ type: this.type, guildId: this.guildId, value }))
    }

    parsedValue() {
        const message = this.getMessage()
        if (message) return messageLink(message.channelId, message.id, message.guildId)
        return this.getChannel()?.toString() ?? this.getRole()?.toString() ?? this.value
    }
}

export const Config = modelClassCached(ConfigClass)
export type Config = DocumentType<ConfigClass>

Config.cache
    .on("add", (value) => {
        if (!mapped.get(value.type)?.set(value.guildId, value))
            mapped.set(value.type, new Map([[value.guildId, value]]))
    })
    .on("delete", (value) => {
        mapped.get(value.type)?.delete(value.guildId)
    })
