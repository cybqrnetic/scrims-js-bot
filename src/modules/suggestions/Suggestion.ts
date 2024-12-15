import { EmbedBuilder, codeBlock, time, userMention } from "discord.js"

import {
    ColorUtil,
    DiscordIdProp,
    Document,
    Prop,
    SchemaDocument,
    TextUtil,
    getSchemaFromClass,
    modelSchema
} from "lib"

@Document("Suggestion", "suggestions")
class SuggestionSchema {
    @Prop({ type: Number, required: true })
    sequence!: number

    @DiscordIdProp({ required: true })
    creatorId!: string

    @DiscordIdProp({ required: true })
    guildId!: string

    @DiscordIdProp({ required: true })
    channelId!: string

    @DiscordIdProp({ required: true })
    messageId!: string

    @Prop({ type: Date, default: Date.now })
    createdAt!: Date

    @Prop({ type: String, required: false })
    imageURL?: string

    @Prop({ type: String, required: false })
    title?: string

    @Prop({ type: String, required: true })
    idea!: string

    @Prop({ type: Date, required: false })
    epic?: Date

    toEmbed(hue = 60) {
        return new EmbedBuilder()
            .setColor(hue < 0 ? "#AC1DB8" : ColorUtil.hsvToRgb(hue, 1, 1))
            .setImage(this.imageURL ?? null)
            .setTitle(this.title ?? null)
            .setDescription(this.idea)
            .setFooter(this.sequence ? { text: `Suggestion #${this.sequence}` } : null)
    }

    toEmbedField() {
        const info = `**Created by ${userMention(this.creatorId)} on ${time(this.createdAt, "F")}**`
        const msg = TextUtil.limitText(this.idea, 1024 - info.length - 10, "\n...")
        return {
            name: this.title ?? `Suggestion #${this.sequence}`,
            value: `${info}\n${codeBlock(msg)}`,
            inline: false,
        }
    }
}

const schema = getSchemaFromClass(SuggestionSchema)
export const Suggestion = modelSchema(schema, SuggestionSchema)
export type Suggestion = SchemaDocument<typeof schema>
