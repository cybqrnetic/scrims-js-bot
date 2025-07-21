import { type GuildMember, type User } from "discord.js"
import { getMainGuild, SequencedAsyncExecutor } from "lib"

import { MAIN_GUILD_ID } from "@Constants"
import { PositionRole } from "@module/positions"
import { UserProfile } from "@module/profiler"
import { UserRejoinRoles } from "./RejoinRoles"
import { TransientRole } from "./TransientRole"

type UserResolvable = string | GuildMember | User | UserProfile
function id(user: UserResolvable) {
    return typeof user === "string" ? user : (user.id as string)
}

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
        const rejoinRoles = UserRejoinRoles.cache.get(userId)
        return rejoinRoles ? roles.some((v) => !TransientRole.isTransient(v) && rejoinRoles.has(v)) : false
    }

    return roles.some((v) => hasRole(member, v))
}

function hasRole(member: GuildMember, role: string) {
    // @ts-expect-error the getter on member.roles.cache is very inefficient
    return member._roles.includes(role)
}

const userSync = new SequencedAsyncExecutor()
export async function acquired<T>(userId: string, action: () => Promise<T>) {
    return userSync.submit(userId, action)
}

async function updatePositions(user: UserResolvable, position: string, reason: string, remove: boolean) {
    return acquired(id(user), async () => {
        const roles = PositionRole.getPermittedRoles(position, MAIN_GUILD_ID)
        const member = getMainGuild()?.members.resolve(id(user))
        if (member) {
            const roleCache = member.roles.cache
            const result = await Promise.all(
                roles
                    .filter((v) => (remove ? roleCache.has(v.id) : !roleCache.has(v.id)))
                    .map((v) => (remove ? member.roles.remove(v, reason) : member.roles.add(v, reason))),
            )
            return result.length > 0
        } else {
            const cmd = remove ? "$pull" : "$addToSet"
            const update = await UserRejoinRoles.updateOne(
                { _id: id(user) },
                { [cmd]: { roles: { $each: roles.map((v) => v.id) } } },
            )
            return update.modifiedCount > 0
        }
    })
}
