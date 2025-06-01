import { RANKS } from "@Constants"
import { Collection, type GuildMember, type User } from "discord.js"
import { bot, MAIN_GUILD_ID } from "lib"
import { PositionRole } from "./PositionRole"

export const Positions = PositionRole.declarePositions({
    Staff: "Staff",
    TrialStaff: "Trial Staff",
    Support: "Support",
    TrialSupport: "Trial Support",

    Member: "Bridge Scrims Member",
    Banned: "Banned",
    Muted: "Muted",

    SupportBlacklisted: "Support Blacklisted",
    SuggestionsBlacklisted: "Suggestions Blacklisted",
})

PositionRole.declarePositions(RANKS)
for (const rank of Object.values(RANKS)) {
    PositionRole.declarePosition(`${rank} Council`)
    PositionRole.declarePosition(`${rank} Head`)
}

export * from "./PositionRole"

export class OnlinePositions {
    static hasPosition(user: User | GuildMember, position: string, guildId = MAIN_GUILD_ID) {
        const roles = PositionRole.getPositionRoles(position, guildId).map((v) => v.roleId)
        return !roles.length ? undefined : hasRoles(user.id, guildId, roles)
    }

    static getMembersWithPosition(position: string, guildId = MAIN_GUILD_ID) {
        const roles = PositionRole.getPositionRoles(position, guildId).map((v) => v.roleId)
        const members = bot.guilds.cache.get(guildId)?.members.cache ?? new Collection()
        return members.filter((m) => hasRoles(m.id, guildId, roles))
    }
}

function hasRoles(userId: string, guildId: string, roles: string[]) {
    const member = bot.guilds.cache.get(guildId)?.members.resolve(userId)
    return member ? roles.some((v) => hasRole(member, v)) : undefined
}

function hasRole(member: GuildMember, role: string) {
    // @ts-expect-error the getter on member.roles.cache is very inefficient
    return member._roles.includes(role)
}
