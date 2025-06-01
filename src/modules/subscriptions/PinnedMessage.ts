import { DocumentType, Prop } from "@typegoose/typegoose"
import { Document, modelClass } from "lib"
import { Types } from "mongoose"

@Document("PinnedMessage", "pinnedmessages")
class PinnedMessageSchema {
    @Prop({ type: Types.Long, required: true })
    _id!: string

    @Prop({ type: Types.Long, required: true })
    channelId!: string

    @Prop({ type: Types.Long, required: true })
    guildId!: string

    @Prop({ type: Types.Long, required: true })
    userId!: string

    @Prop({ type: String, required: true })
    url!: string
}

export const PinnedMessage = modelClass(PinnedMessageSchema)
export type PinnedMessage = DocumentType<PinnedMessageSchema>
