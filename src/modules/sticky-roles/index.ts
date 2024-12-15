import type { GuildMember, User } from "discord.js"
import { DiscordBot, UserProfile } from "lib"

import { HOST_GUILD_ID } from "@Constants"
import { PositionRole } from "@module/positions"
import { UserRejoinRoles } from "./RejoinRoles"
import { TransientRole } from "./TransientRole"

type UserResolvable = GuildMember | User | UserProfile

export * from "./RejoinRoles"
export * from "./TransientRole"

export class OfflinePositions {
    static hasPosition(user: UserResolvable, position: string) {
        const roles = PositionRole.getPositionRoles(position, HOST_GUILD_ID).map((v) => v.roleId)
        return roles.length ? hasRoles(user.id, roles) : undefined
    }

    static getUsersWithPosition(position: string) {
        const roles = PositionRole.getPositionRoles(position, HOST_GUILD_ID).map((v) => v.roleId)
        if (!roles.length) return []

        return Array.from(UserProfile.cache.values()).filter((user) => hasRoles(user.id, roles))
    }

    static async addPosition(user: UserResolvable, position: string, reason: string) {
        return updatePositions(user, position, reason, false)
    }

    static async removePosition(user: UserResolvable, position: string, reason: string) {
        return updatePositions(user, position, reason, true)
    }
}

function hasRoles(userId: string, roles: string[]) {
    const member = DiscordBot.getInstance().host?.members.resolve(userId)
    if (!member) {
        const saved = new Set(UserRejoinRoles.cache.get(userId)?.roles)
        return roles.some((v) => !TransientRole.isTransient(v) && saved.has(v))
    }

    return roles.some((v) => hasRole(member, v))
}

function hasRole(member: GuildMember, role: string) {
    // @ts-expect-error the getter on member.roles.cache is very inefficient
    return member._roles.includes(role)
}

async function updatePositions(user: UserResolvable, position: string, reason: string, remove: boolean) {
    const roles = PositionRole.getPermittedRoles(position, HOST_GUILD_ID)
    const member = DiscordBot.getInstance().host?.members.resolve(user.id)
    if (member) {
        await Promise.all(
            roles.map((v) => (remove ? member.roles.remove(v, reason) : member.roles.add(v, reason))),
        )
    } else {
        const cmd = remove ? "$pull" : "$push"
        await UserRejoinRoles.updateOne(
            { _id: user.id },
            { [cmd]: { roles: { $in: roles.map((v) => v.id) } } },
        )
    }
}
