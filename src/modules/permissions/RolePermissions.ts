import { DiscordBot, Document, Prop, SchemaDocument, getSchemaFromClass, modelSchemaWithCache } from "lib"

@Document("RolePermissions", "permissions")
class RolePermissionsSchema {
    @Prop({ type: String, required: true })
    _id!: string

    @Prop({ type: [String], required: true })
    permissions!: string[]

    role() {
        return DiscordBot.getInstance().host?.roles.cache.get(this._id)
    }
}

const schema = getSchemaFromClass(RolePermissionsSchema)
export const RolePermissions = modelSchemaWithCache(schema, RolePermissionsSchema)
export type RolePermissions = SchemaDocument<typeof schema>
