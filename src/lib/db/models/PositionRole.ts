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

const mapped = new Map<string, Map<string, Set<PositionRole>>>()
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
        return this.getPositionRoles(position, guildId)
            .map((v) => v.role())
            .filter((v): v is Role => v !== undefined)
    }

    static getPositionRoles(position: string, guildId: string) {
        return [...(mapped.get(guildId)?.get(position) ?? [])]
    }

    static getPermittedRoles(position: string, guildId: string) {
        return this.resolvePermittedRoles(this.getPositionRoles(position, guildId))
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

PositionRole.cache.on("set", (posRole) => {
    let guildMap = mapped.get(posRole.guildId)
    if (!guildMap) {
        guildMap = new Map()
        mapped.set(posRole.guildId, guildMap)
    }

    if (!guildMap.get(posRole.position)?.add(posRole)) {
        guildMap.set(posRole.position, new Set([posRole]))
    }
})

PositionRole.cache.on("delete", (posRole) => {
    mapped.get(posRole.guildId)?.get(posRole.position)?.delete(posRole)
})
