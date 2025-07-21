import { DocumentType, getModelForClass, Prop } from "@typegoose/typegoose"
import { Document } from "lib"
import { Types } from "mongoose"

class Unban {
    @Prop({ type: Types.Long, required: true })
    executor!: string

    @Prop({ type: String, required: false })
    reason?: string
}

@Document("ScrimsBan", "scrimbans")
class ScrimBanClass {
    @Prop({ type: Types.Long, required: true })
    user!: string

    @Prop({ type: Types.Long, required: true })
    executor!: string

    @Prop({ type: [Types.Long], required: false })
    roles!: Types.Long[]

    @Prop({ type: Date, required: true })
    creation!: Date

    @Prop({ type: Date, required: false })
    expiration?: Date

    @Prop({ type: String, required: false })
    reason?: string

    @Prop({ type: Unban, _id: false, required: false })
    unban?: Unban

    getRoles() {
        return this.roles.map((v) => v.toString())
    }
}

export const ScrimsBan = getModelForClass(ScrimBanClass)
export type ScrimsBan = DocumentType<ScrimBanClass>
