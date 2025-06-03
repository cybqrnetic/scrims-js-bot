import { DocumentType, Prop } from "@typegoose/typegoose"
import { Document, modelClassCached } from "lib"
import { Types } from "mongoose"

@Document("UserRejoinRoles", "rejoinroles")
class RejoinRolesClass {
    @Prop({ type: Types.Long, required: true })
    _id!: string

    @Prop({ type: [Types.Long], required: true })
    roles!: Types.Long[]
}

export const UserRejoinRoles = modelClassCached(RejoinRolesClass)
export type UserRejoinRoles = DocumentType<RejoinRolesClass>
