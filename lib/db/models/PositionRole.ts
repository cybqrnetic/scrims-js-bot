import { Role } from "discord.js"
import { ScrimsBot } from "../../discord/ScrimsBot"
import {
    DiscordIdProp,
    Document,
    Prop,
    SchemaDocument,
    getSchemaFromClass,
    modelSchemaWithCache,
} from "../util"

const declaredPositions = new Set<string>()

@Document("PositionRole", "positionroles")
class PositionRoleSchema {
    static declarePositions<T extends object>(positions: T): T {
        if (Array.isArray(positions)) positions.forEach((pos) => declaredPositions.add(pos))
        else Object.values(positions).forEach((pos) => declaredPositions.add(pos))
        return positions
    }

    static declarePosition<T extends string>(position: T): T {
        declaredPositions.add(position)
        return position
    }

    static declaredPositions() {
        return declaredPositions
    }

    static getRoles(position: string, guildId: string) {
        return PositionRole.cache
            .filter((v) => v.position === position && v.guildId === guildId)
            .map((v) => v.role())
            .filter((v): v is Role => !!v)
    }

    static getPermittedRoles(position: string, guildId: string) {
        return this.getRoles(position, guildId).filter((v) => ScrimsBot.INSTANCE!.hasRolePermissions(v))
    }

    static resolvePermittedRoles(positionRoles: PositionRole[]) {
        return positionRoles
            .map((v) => v.role())
            .filter((v): v is Role => !!v && ScrimsBot.INSTANCE!.hasRolePermissions(v))
    }

    @Prop({ type: String, required: true })
    position!: string

    @DiscordIdProp({ required: true })
    guildId!: string

    @DiscordIdProp({ required: true })
    roleId!: string

    guild() {
        return ScrimsBot.INSTANCE?.guilds.cache.get(this.guildId)
    }

    role() {
        return this.guild()?.roles.cache.get(this.roleId)
    }
}

const schema = getSchemaFromClass(PositionRoleSchema)
export const PositionRole = modelSchemaWithCache(schema, PositionRoleSchema)
export type PositionRole = SchemaDocument<typeof schema>
