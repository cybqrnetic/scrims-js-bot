import { DiscordIdProp, Document, Prop, SchemaDocument, getSchemaFromClass, modelSchema } from "lib"

@Document("CouncilSession", "councilsessions")
class Prototype {
    @Prop({ type: Date, required: true })
    date!: Date

    @Prop({ type: String, required: true })
    rank!: string

    @DiscordIdProp({ required: true })
    council!: string

    @Prop({ type: Number, required: true })
    time!: number

    @Prop({ type: Number, required: true })
    vouches!: number

    @Prop({ type: Number, required: true })
    devouches!: number
}

const schema = getSchemaFromClass(Prototype)
export const CouncilSession = modelSchema(schema, Prototype)
export type CouncilSession = SchemaDocument<typeof schema>
