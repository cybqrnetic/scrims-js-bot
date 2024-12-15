import {
    DiscordBot,
    DiscordIdProp,
    Document,
    Prop,
    SchemaDocument,
    getSchemaFromClass,
    modelSchema,
} from "lib"

@Document("Ticket", "tickets")
class TicketSchema {
    @DiscordIdProp({ required: true })
    userId!: string

    @Prop({ type: String, required: true })
    type!: string

    @Prop({ type: String, default: "open" })
    status!: "open" | "closed" | "deleted"

    @DiscordIdProp({ required: true })
    guildId!: string

    @DiscordIdProp({ required: true })
    channelId!: string

    @Prop({ type: Date, default: Date.now })
    createdAt!: Date

    @Prop({ type: Date, required: false })
    deletedAt?: Date

    @DiscordIdProp({ required: false })
    closerId?: string

    @Prop({ type: String, required: false })
    closeReason?: string

    @Prop({ type: Object, required: false })
    extras?: unknown

    user() {
        return DiscordBot.INSTANCE?.users.resolve(this.userId)
    }
}

const schema = getSchemaFromClass(TicketSchema)
export const Ticket = modelSchema(schema, TicketSchema)
export type Ticket<Extras extends object = any> = SchemaDocument<typeof schema> & { extras?: Extras }
