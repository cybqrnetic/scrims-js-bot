import { DocumentType, Prop } from "@typegoose/typegoose"
import { EmbedBuilder, TextChannel, codeBlock, time, userMention } from "discord.js"

import { ColorUtil, Document, TextUtil, bot, modelClass } from "lib"
import { Types } from "mongoose"

@Document("Suggestion", "suggestions")
class SuggestionClass {
    @Prop({ required: true })
    sequence!: number

    @Prop({ type: Types.Long, required: true })
    creatorId!: string

    @Prop({ type: Types.Long, required: true })
    guildId!: string

    @Prop({ type: Types.Long, required: true })
    channelId!: string

    @Prop({ type: Types.Long, required: true })
    messageId!: string

    @Prop({ default: Date.now })
    createdAt!: Date

    @Prop()
    imageURL?: string

    @Prop()
    title?: string

    @Prop({ required: true })
    idea!: string

    @Prop()
    epic?: Date

    channel() {
        return bot.channels.cache.get(this.channelId) as TextChannel | undefined
    }

    message() {
        return this.channel()?.messages.cache.get(this.messageId)
    }

    toEmbed(hue = 60) {
        return new EmbedBuilder()
            .setColor(hue < 0 ? 0xac1db8 : ColorUtil.hsvToRgb(hue, 1, 1))
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

export const Suggestion = modelClass(SuggestionClass)
export type Suggestion = DocumentType<SuggestionClass>
