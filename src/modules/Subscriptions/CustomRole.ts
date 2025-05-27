import { DiscordIdProp, Document, getSchemaFromClass, modelSchema, SchemaDocument } from "lib"

@Document("CustomRole", "customroles")
class CustomRoleSchema {
    @DiscordIdProp({ required: true })
    _id!: string

    @DiscordIdProp({ required: true })
    userId!: string

    @DiscordIdProp({ required: true })
    guildId!: string
}

const schema = getSchemaFromClass(CustomRoleSchema)
export const CustomRole = modelSchema(schema, CustomRoleSchema)
export type CustomRole = SchemaDocument<typeof schema>
