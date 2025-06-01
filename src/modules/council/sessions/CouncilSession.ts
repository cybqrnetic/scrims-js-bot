import { DocumentType, Prop } from "@typegoose/typegoose"
import { Document, modelClass } from "lib"
import { Types } from "mongoose"

@Document("CouncilSession", "councilsessions")
class Prototype {
    @Prop({ type: Date, required: true })
    date!: Date

    @Prop({ type: String, required: true })
    rank!: string

    @Prop({ type: Types.Long, required: true })
    council!: string

    @Prop({ type: Number, required: true })
    time!: number

    @Prop({ type: Number, required: true })
    vouches!: number

    @Prop({ type: Number, required: true })
    devouches!: number
}

export const CouncilSession = modelClass(Prototype)
export type CouncilSession = DocumentType<Prototype>
