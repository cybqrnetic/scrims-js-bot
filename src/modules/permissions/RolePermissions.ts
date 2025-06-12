import { DocumentType, Prop } from "@typegoose/typegoose"
import { Document, getMainGuild, modelClassCached } from "lib"
import { Types } from "mongoose"

@Document("RolePermissions", "permissions")
class RolePermissionsClass {
    @Prop({ type: Types.Long, required: true })
    _id!: string

    @Prop({ type: String, required: false })
    name?: string

    @Prop({ type: [String], required: true })
    permissions!: string[]

    role() {
        return getMainGuild()?.roles.cache.get(this._id)
    }
}

export const RolePermissions = modelClassCached(RolePermissionsClass)
export type RolePermissions = DocumentType<RolePermissionsClass>
