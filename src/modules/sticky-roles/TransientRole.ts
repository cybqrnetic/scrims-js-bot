import { DocumentType, Prop } from "@typegoose/typegoose"
import { Document, modelClassCached } from "lib"
import { Types } from "mongoose"

@Document("TransientRole", "transientroles")
class TransientRoleClass {
    static isTransient(role: string) {
        return TransientRole.cache.has(role)
    }

    @Prop({ type: Types.Long, required: true })
    _id!: string
}

export const TransientRole = modelClassCached(TransientRoleClass)
export type TransientRole = DocumentType<TransientRoleClass>
