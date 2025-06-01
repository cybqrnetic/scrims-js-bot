import { DocumentType, getModelForClass, Prop } from "@typegoose/typegoose"
import { bot, Document } from "lib"
import { Types } from "mongoose"

export class CloseTimeout {
    @Prop({ type: Types.Long, required: true })
    messageId!: string

    @Prop({ required: true })
    timestamp!: Date

    @Prop({ type: Types.Long, required: true })
    closerId!: string

    @Prop({ required: false })
    reason?: string
}

@Document("Ticket", "tickets")
class TicketClass {
    @Prop({ type: Types.Long, required: true })
    userId!: string

    @Prop({ required: true })
    type!: string

    @Prop({ type: String, default: "open" })
    status!: "open" | "closed" | "deleted"

    @Prop({ type: Types.Long, required: true })
    guildId!: string

    @Prop({ type: Types.Long, required: true })
    channelId!: string

    @Prop({ default: Date.now })
    createdAt!: Date

    @Prop()
    deletedAt?: Date

    @Prop({ type: Types.Long })
    closerId?: string

    @Prop()
    closeReason?: string

    @Prop({ type: CloseTimeout, _id: false })
    closeTimeouts?: CloseTimeout[]

    @Prop()
    extras?: object

    user() {
        return bot.users.resolve(this.userId)
    }
}

export const Ticket = getModelForClass(TicketClass)
export type Ticket<Extras extends object = object> = DocumentType<TicketClass> & { extras?: Extras }
