import { DiscordIdProp, Document, getSchemaFromClass, modelSchema, Prop, SchemaDocument } from "lib"

@Document("PinnedMessage", "pinnedmessages")
class PinnedMessageSchema {
    @DiscordIdProp({ required: true })
    _id!: string

    @DiscordIdProp({ required: true })
    channelId!: string

    @DiscordIdProp({ required: true })
    guildId!: string

    @DiscordIdProp({ required: true })
    userId!: string

    @Prop({ type: String, required: true })
    url!: string
}

const schema = getSchemaFromClass(PinnedMessageSchema)
export const PinnedMessage = modelSchema(schema, PinnedMessageSchema)
export type PinnedMessage = SchemaDocument<typeof schema>
