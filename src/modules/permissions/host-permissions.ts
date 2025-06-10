import { MAIN_GUILD_ID } from "@Constants"
import { membersFetched } from "@module/member-fetcher"
import { Events, GuildMember, User, type PartialGuildMember } from "discord.js"
import EventEmitter from "events"
import { BotListener, getMainGuild } from "lib"
import {
    AllPermissionsAddedUpdate,
    AllPermissionsRemovedUpdate,
    DiffPermissionsUpdate,
    FreshPermissionsUpdate,
    PermissionsGainedUpdate,
    PermissionsLostUpdate,
    PermissionUpdate,
} from "./permission-update"
import { RolePermissions } from "./RolePermissions"

const ADMIN = Symbol("Administrator")
const memberPermissions = new Map<string, Set<string> | typeof ADMIN>()

declare module "discord.js" {
    interface GuildMember {
        hasPermission(permission: string): boolean
    }

    interface User {
        hasPermission(permission: string): boolean
    }
}

User.prototype.hasPermission = function (permission: string) {
    const perms = memberPermissions.get(this.id)
    if (perms === undefined) return false
    if (perms === ADMIN) return true
    return perms.has(permission)
}

GuildMember.prototype.hasPermission = function (permission: string) {
    return this.user.hasPermission(permission)
}

function getRoles(member: GuildMember | PartialGuildMember) {
    // @ts-expect-error the getter on member.roles.cache is very inefficient
    return member._roles as string[]
}

function isAdmin(member: GuildMember | PartialGuildMember) {
    return member.permissions.has("Administrator")
}

BotListener(Events.GuildMemberAdd, (_bot, member) => {
    if (member.guild.id === MAIN_GUILD_ID) {
        recalculateMember(member, true)
    }
})

BotListener(Events.GuildMemberRemove, (_bot, member) => {
    if (member.guild.id === MAIN_GUILD_ID) {
        deleteMember(member.id)
    }
})

BotListener(Events.GuildMemberUpdate, (_bot, old, member) => {
    if (member.guild.id === MAIN_GUILD_ID) {
        if (
            isAdmin(old) !== isAdmin(member) ||
            JSON.stringify(getRoles(old)) !== JSON.stringify(getRoles(member))
        ) {
            recalculateMember(member, false)
        }
    }
})

BotListener(Events.GuildRoleUpdate, async (_bot, oldRole, newRole) => {
    if (newRole.guild.id === MAIN_GUILD_ID) {
        if (oldRole.permissions.has("Administrator") !== newRole.permissions.has("Administrator")) {
            await membersFetched()
            for (const member of getMainGuild()?.members.cache.values() ?? []) {
                if (getRoles(member).includes(newRole.id)) {
                    recalculateMember(member, false)
                }
            }
        }
    }
})

RolePermissions.cache.on("add", () => recalculate())
RolePermissions.cache.on("delete", () => recalculate())
export const initialized = recalculate().catch(console.error)

async function recalculate() {
    await membersFetched()
    const members = getMainGuild()?.members.cache
    if (members) {
        for (const memberId of memberPermissions.keys()) {
            if (!members.has(memberId)) {
                deleteMember(memberId)
            }
        }

        for (const member of members.values()) {
            recalculateMember(member, false)
        }
    }
}

function getPermission(id: string) {
    return RolePermissions.cache.get(id)?.permissions ?? []
}

function recalculateMember(member: GuildMember, newMember: boolean) {
    const previous = memberPermissions.get(member.id)
    if (isAdmin(member)) {
        if (previous !== ADMIN) {
            memberPermissions.set(member.id, ADMIN)
            if (newMember || previous !== undefined) {
                emit("update", member.id, resolveAdminUpdate(previous))
            }
        }
        return
    }

    const permissions = new Set<string>()
    for (const perm of getPermission(member.id)) {
        permissions.add(perm)
    }

    const roles = getRoles(member)
    for (const role of roles) {
        for (const perm of getPermission(role)) {
            permissions.add(perm)
        }
    }

    if (
        !(previous instanceof Set) ||
        previous.size !== permissions.size ||
        !Array.from(previous).every((perm) => permissions.has(perm))
    ) {
        memberPermissions.set(member.id, permissions)
        if (newMember || previous !== undefined) {
            emit("update", member.id, resolvePermUpdate(previous, permissions))
        }
    }
}

function resolveAdminUpdate(previous: Set<string> | undefined) {
    return previous === undefined ? new AllPermissionsAddedUpdate() : new PermissionsGainedUpdate(previous)
}

function resolvePermUpdate(previous: typeof ADMIN | Set<string> | undefined, permissions: Set<string>) {
    if (previous === undefined) return new FreshPermissionsUpdate(permissions)
    if (previous === ADMIN) return new PermissionsLostUpdate(permissions)
    return new DiffPermissionsUpdate(previous, permissions)
}

function deleteMember(memberId: string) {
    if (memberPermissions.delete(memberId)) {
        emit("update", memberId, new AllPermissionsRemovedUpdate())
    }
}

export const events = new EventEmitter()
events.on("error", console.error)

function emit<K extends keyof PermissionEvents>(event: K, ...args: PermissionEvents[K]) {
    events.emit(event, ...args)
}

export interface PermissionEvents {
    ["update"]: [user: string, update: PermissionUpdate]
}
