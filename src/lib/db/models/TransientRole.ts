import { DiscordIdProp, Document, SchemaDocument, getSchemaFromClass, modelSchemaWithCache } from "../util"

@Document("TransientRole", "transientroles")
class TransientRoleSchema {
    static isTransient(role: string) {
        return cache.has(role)
    }

    @DiscordIdProp({ required: true })
    _id!: string
}

const schema = getSchemaFromClass(TransientRoleSchema)
export const TransientRole = modelSchemaWithCache(schema, TransientRoleSchema)
export type TransientRole = SchemaDocument<typeof schema>

const cache = new Set()
TransientRole.cache.on("add", (role) => cache.add(role._id))
TransientRole.cache.on("delete", (role) => cache.delete(role._id))
