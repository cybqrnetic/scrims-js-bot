import type { GuildMember, User } from "discord.js"
import { getMainGuild, sequencedAsync } from "lib"

import { MAIN_GUILD_ID } from "@Constants"
import { PositionRole } from "@module/positions"
import { UserProfile } from "@module/profiler"
import { UserRejoinRoles } from "./RejoinRoles"
import { TransientRole } from "./TransientRole"

type UserResolvable = string | GuildMember | User | UserProfile
function id(user: UserResolvable) {
    return typeof user === "string" ? user : (user.id as string)
}

export * from "./RejoinRoles"
export * from "./TransientRole"

export class OfflinePositions {
    static hasPosition(user: UserResolvable, position: string) {
        const roles = PositionRole.getPositionRoles(position, MAIN_GUILD_ID).map((v) => v.roleId)
        return roles.length ? hasRoles(id(user), roles) : undefined
    }

    static getUsersWithPosition(position: string) {
        const roles = PositionRole.getPositionRoles(position, MAIN_GUILD_ID).map((v) => v.roleId)
        if (!roles.length) return []

        return UserProfile.getIds().filter((id) => hasRoles(id, roles))
    }

    static async addPosition(user: UserResolvable, position: string, reason: string) {
        return updatePositions(user, position, reason, false)
    }

    static async removePosition(user: UserResolvable, position: string, reason: string) {
        return updatePositions(user, position, reason, true)
    }
}

function hasRoles(userId: string, roles: string[]) {
    const member = getMainGuild()?.members.resolve(userId)
    if (!member) {
        const saved = new Set(UserRejoinRoles.cache.get(userId)?.roles.map((v) => v.toString()))
        return roles.some((v) => !TransientRole.isTransient(v) && saved.has(v))
    }

    return roles.some((v) => hasRole(member, v))
}

function hasRole(member: GuildMember, role: string) {
    // @ts-expect-error the getter on member.roles.cache is very inefficient
    return member._roles.includes(role)
}

export const acquired = sequencedAsync((userId: string, action: () => Promise<unknown>) => action(), {
    mapper: (userId) => userId,
})

async function updatePositions(user: UserResolvable, position: string, reason: string, remove: boolean) {
    const roles = PositionRole.getPermittedRoles(position, MAIN_GUILD_ID)
    await acquired(id(user), async () => {
        const member = getMainGuild()?.members.resolve(id(user))
        if (member) {
            await Promise.all(
                roles.map((v) => (remove ? member.roles.remove(v, reason) : member.roles.add(v, reason))),
            )
        } else {
            const cmd = remove ? "$pull" : "$push"
            await UserRejoinRoles.updateOne(
                { _id: id(user) },
                { [cmd]: { roles: { $in: roles.map((v) => v.id) } } },
            )
        }
    })
}
