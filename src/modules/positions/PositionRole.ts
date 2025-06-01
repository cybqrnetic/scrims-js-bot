import { DocumentType, Prop } from "@typegoose/typegoose"
import { Role } from "discord.js"
import { bot, Document, modelClassCached } from "lib"
import { Types } from "mongoose"

@Document("PositionRole", "positionroles")
class PositionRoleClass {
    static declarePositions<T extends string[] | Record<string, string>>(positions: T): T {
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

    static getGuildRoles(guildId: string) {
        if (!(guildId in mapped)) return []
        return Object.values(mapped[guildId]!).flatMap((v) => Array.from(v))
    }

    static getPositionRoles(position: string, guildId: string) {
        return [...(mapped[guildId]?.[position] ?? [])]
    }

    static getPermittedRoles(position: string, guildId: string) {
        return this.resolvePermittedRoles(this.getPositionRoles(position, guildId))
    }

    static resolvePermittedRoles(positionRoles: PositionRole[]) {
        const roles = Array.from(new Set(positionRoles.map((v) => v.role())))
        return roles.filter((v): v is Role => v?.editable === true)
    }

    @Prop({ type: String, required: true })
    position!: string

    @Prop({ type: Types.Long, required: true })
    guildId!: string

    @Prop({ type: Types.Long, required: true })
    roleId!: string

    guild() {
        return bot.guilds.cache.get(this.guildId)
    }

    role() {
        return this.guild()?.roles.cache.get(this.roleId)
    }
}

export const PositionRole = modelClassCached(PositionRoleClass)
export type PositionRole = DocumentType<PositionRoleClass>

const mapped: Record<string, Record<string, Set<PositionRole>>> = {}
const declaredPositions = new Set<string>()

PositionRole.cache
    .on("add", (posRole) => {
        let guildMap = mapped[posRole.guildId]
        if (!guildMap) {
            guildMap = {}
            mapped[posRole.guildId] = guildMap
        }

        if (!guildMap[posRole.position]?.add(posRole)) {
            guildMap[posRole.position] = new Set([posRole])
        }
    })
    .on("delete", (posRole) => {
        mapped[posRole.guildId]?.[posRole.position]?.delete(posRole)
    })
