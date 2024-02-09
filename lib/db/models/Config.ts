import { ScrimsBot } from "../../discord/ScrimsBot"
import {
    DiscordIdProp,
    Document,
    Prop,
    SchemaDocument,
    getSchemaFromClass,
    modelSchemaWithCache,
} from "../util"

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
        return this.getChannel() ?? this.getRole() ?? this.getMessage() ?? this.value
    }
}

const schema = getSchemaFromClass(ConfigSchema)
export const Config = modelSchemaWithCache(schema, ConfigSchema)
export type Config = SchemaDocument<typeof schema>
