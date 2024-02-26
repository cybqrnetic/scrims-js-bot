import {
    DiscordIdArrayProp,
    DiscordIdProp,
    Document,
    SchemaDocument,
    getSchemaFromClass,
    modelSchema,
} from "../util"

@Document("UserRejoinRoles", "rejoinroles")
class RejoinRolesSchema {
    @DiscordIdProp({ required: true })
    _id!: string

    @DiscordIdArrayProp({ required: true })
    roles!: string[]
}

const schema = getSchemaFromClass(RejoinRolesSchema)
export const UserRejoinRoles = modelSchema(schema, RejoinRolesSchema)
export type UserRejoinRoles = SchemaDocument<typeof schema>
