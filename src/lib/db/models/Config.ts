import { messageLink } from "discord.js"
import { ScrimsBot } from "../../discord/ScrimsBot"
import {
    DiscordIdProp,
    Document,
    Prop,
    SchemaDocument,
    getSchemaFromClass,
    modelSchemaWithCache,
} from "../util"

const mapped = new Map<string, Map<string, Config>>()
const declaredTypes = new Set<string>()

@Document("Config", "config")
class ConfigSchema {
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
                listener(doc)
            }
        })
        return this
    }

    @Prop({ type: String, required: true })
    type!: string

    @DiscordIdProp({ required: true })
    guildId!: string

    @Prop({ type: String, required: true })
    value!: string

    @Prop({ type: String, required: false })
    clientId!: string

    guild() {
        return ScrimsBot.INSTANCE?.guilds.cache.get(this.guildId)
    }

    getMessage() {
        if (this.value?.includes("-")) {
            const [channelId, messageId] = this.value.split("-")
            const channel = this.guild()?.channels.cache.get(channelId)
            if (channel?.isTextBased()) return channel.messages.cache.get(messageId)
        }
    }

    getChannel() {
        return this.guild()?.channels.cache.get(this.value)
    }

    getRole() {
        return this.guild()?.roles.cache.get(this.value)
    }

    parsedValue() {
        const message = this.getMessage()
        if (message) return messageLink(message.channelId, message.id, message.guildId)
        return this.getChannel()?.toString() ?? this.getRole()?.toString() ?? this.value
    }
}

const schema = getSchemaFromClass(ConfigSchema)
export const Config = modelSchemaWithCache(schema, ConfigSchema)
export type Config = SchemaDocument<typeof schema>

Config.cache.on("add", (value) => {
    if (!mapped.get(value.type)?.set(value.guildId, value))
        mapped.set(value.type, new Map([[value.guildId, value]]))
})

Config.cache.on("delete", (value) => {
    mapped.get(value.type)?.delete(value.guildId)
})
