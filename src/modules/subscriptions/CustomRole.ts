import { DocumentType, Prop } from "@typegoose/typegoose"
import { Document, modelClass } from "lib"
import { Types } from "mongoose"

@Document("CustomRole", "customroles")
class CustomRoleSchema {
    @Prop({ type: Types.Long, required: true })
    _id!: string

    @Prop({ type: Types.Long, required: true })
    userId!: string

    @Prop({ type: Types.Long, required: true })
    guildId!: string
}

export const CustomRole = modelClass(CustomRoleSchema)
export type CustomRole = DocumentType<CustomRoleSchema>
