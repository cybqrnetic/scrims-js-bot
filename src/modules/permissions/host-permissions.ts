import { MAIN_GUILD_ID } from "@Constants"
import { membersFetched } from "@module/member-fetcher"
import { Events, GuildMember, User, type PartialGuildMember } from "discord.js"
import EventEmitter from "events"
import { BotListener, getMainGuild } from "lib"
import {
    AdminToNoneUpdate,
    AdminToPermsUpdate,
    DiffPermissionsUpdate,
    NoneToAdminUpdate,
    NoneToPermsUpdate,
    PermissionUpdate,
    PermsToAdminUpdate,
    PermsToNoneUpdate,
} from "./permission-update"
import { RolePermissions } from "./RolePermissions"

const ADMIN = Symbol("Administrator")
export type Permissions = Set<string | typeof ADMIN>
const memberPermissions = new Map<string, Permissions>()

declare module "discord.js" {
    interface GuildMember {
        hasPermission(permission: string, checkAdmin?: boolean): boolean
    }

    interface User {
        hasPermission(permission: string, checkAdmin?: boolean): boolean
    }
}

User.prototype.hasPermission = function (permission, checkAdmin = true) {
    const perms = memberPermissions.get(this.id)
    if (perms === undefined) return false
    if (checkAdmin && perms.has(ADMIN)) return true
    return perms.has(permission)
}

GuildMember.prototype.hasPermission = function (permission, checkAdmin) {
    return this.user.hasPermission(permission, checkAdmin)
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
    const permissions: Permissions = new Set()
    if (isAdmin(member)) {
        permissions.add(ADMIN)
    }

    for (const perm of getPermission(member.id)) {
        permissions.add(perm)
    }

    const roles = getRoles(member)
    for (const role of roles) {
        for (const perm of getPermission(role)) {
            permissions.add(perm)
        }
    }

    memberPermissions.set(member.id, permissions)
    if (newMember || previous !== undefined) {
        emitUpdate(member, previous, permissions)
    }
}

function emitUpdate(member: GuildMember, previous: Permissions | undefined, permissions: Permissions) {
    if (permissions.has(ADMIN) && previous?.has(ADMIN)) {
        return // <-- Still has all perms
    }

    if (
        previous !== undefined &&
        previous.size === permissions.size &&
        Array.from(previous).every((perm) => permissions.has(perm))
    ) {
        return // <-- Permissions equal
    }

    emit("update", member.id, resolvePermUpdate(previous, permissions))
}

function resolvePermUpdate(previous: Permissions | undefined, permissions: Permissions) {
    if (previous === undefined) {
        return permissions.has(ADMIN) ? new NoneToAdminUpdate() : new NoneToPermsUpdate(permissions)
    } else if (previous.has(ADMIN)) {
        return new AdminToPermsUpdate(permissions)
    } else if (permissions.has(ADMIN)) {
        return new PermsToAdminUpdate(previous)
    } else {
        return new DiffPermissionsUpdate(previous, permissions)
    }
}

function deleteMember(memberId: string) {
    const previous = memberPermissions.get(memberId)
    memberPermissions.delete(memberId)
    if (previous !== undefined) {
        if (previous.has(ADMIN)) {
            emit("update", memberId, new AdminToNoneUpdate())
        } else {
            emit("update", memberId, new PermsToNoneUpdate(previous))
        }
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
