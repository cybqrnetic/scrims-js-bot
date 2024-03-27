import { Positions } from "@Constants"
import { GuildMember, Role, User } from "discord.js"
import { PositionRole } from "../db"
import type { ScrimsBot } from "./ScrimsBot"

export class PermissionsManager {
    constructor(protected readonly bot: ScrimsBot) {}

    get host() {
        return this.bot.host
    }

    protected getHostMember(userId: string) {
        return this.host?.members.cache.get(userId)
    }

    protected getGuild(guildId: string) {
        return this.bot.guilds.cache.get(guildId)
    }

    getUsersPositions(user: User) {
        return new Set(
            PositionRole.cache.filter((v) => this.hasPosition(user, v.position)).map((v) => v.position),
        )
    }

    getUsersForbiddenPositions(user: User) {
        return new Set(
            PositionRole.cache
                .filter((v) => this.hasPosition(user, v.position) === false)
                .map((v) => v.position),
        )
    }

    hasPosition(
        user: User | GuildMember,
        position: string,
        guildId = this.bot.hostGuildId,
    ): false | undefined | { expiration: () => Promise<Date | undefined> } {
        const expiration = async () => undefined

        if (position === Positions.Banned)
            return this.getGuild(guildId)?.bans.cache.get(user.id) && { expiration }

        if (this.hasPosition(user, Positions.Banned, guildId)) return false

        const positionRoles = PositionRole.getPositionRoles(position, guildId).map((v) => v.roleId)
        const member = this.getGuild(guildId)?.members.resolve(user.id)
        if (!positionRoles.length || !member) return undefined

        return member.roles.cache.hasAny(...positionRoles) && { expiration }
    }

    hasPositionLevel(user: User | GuildMember, positionLevel: string, guildId = this.bot.hostGuildId) {
        const positionRoles = PositionRole.getRoles(positionLevel, guildId)
        const positionRoleIds = new Set(positionRoles.map((r) => r.id))
        const highest = positionRoles.sort((a, b) => b.comparePositionTo(a))[0]
        if (highest)
            PositionRole.cache
                .filter((v) => v.guildId === highest.guild.id)
                .map((v) => v.role())
                .filter((r): r is Role => !!r && r.comparePositionTo(highest) > 0)
                .forEach((r) => positionRoleIds.add(r.id))

        const member = this.getGuild(guildId)?.members.resolve(user)
        return member?.roles.cache.hasAny(...positionRoleIds)
    }

    hasPermissions(user: User | GuildMember, permissions: Permissions) {
        const member = this.getHostMember(user.id)
        const hasPositions = permissions.positions?.some((p) => this.hasPosition(user, p))
        const hasPositionLevel = permissions.positionLevel
            ? !!this.hasPositionLevel(user, permissions.positionLevel)
            : undefined

        const required = [hasPositions, hasPositionLevel]
        return (
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            member?.permissions.has("Administrator") || required.some((v) => v === true)
        )
    }
}

export interface Permissions {
    positions?: string[]
    positionLevel?: string
}
