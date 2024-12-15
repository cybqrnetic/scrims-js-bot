import { HOST_GUILD_ID } from "@Constants"
import { Events, GuildMember, User, type PartialGuildMember } from "discord.js"
import { BotListener, DiscordBot } from "lib"
import { RolePermissions } from "./RolePermissions"

const ADMIN = "ADMIN"
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
    // @ts-expect-error
    return member._roles as string[]
}

function isAdmin(member: GuildMember | PartialGuildMember) {
    return member.permissions.has("Administrator")
}

RolePermissions.cache.on("add", () => recalculate())
RolePermissions.cache.on("delete", () => recalculate())

BotListener(Events.GuildMemberAdd, (_bot, member) => {
    if (member.guild.id === HOST_GUILD_ID) {
        recalculateMember(member)
    }
})

BotListener(Events.GuildMemberRemove, (_bot, member) => {
    if (member.guild.id === HOST_GUILD_ID) {
        memberPermissions.delete(member.id)
    }
})

BotListener(Events.GuildMemberUpdate, (_bot, old, member) => {
    if (member.guild.id === HOST_GUILD_ID) {
        if (
            isAdmin(old) !== isAdmin(member) ||
            JSON.stringify(getRoles(old)) !== JSON.stringify(getRoles(member))
        ) {
            recalculateMember(member)
        }
    }
})

BotListener("initialized", () => recalculate())

function recalculate() {
    const members = DiscordBot.getInstance().host?.members.cache.values()
    if (members) {
        memberPermissions.clear()
        for (const member of Array.from(members)) {
            recalculateMember(member)
        }
    }
}

function getPermission(id: string) {
    return RolePermissions.cache.get(id)?.permissions ?? []
}

function recalculateMember(member: GuildMember) {
    if (isAdmin(member)) {
        memberPermissions.set(member.id, ADMIN)
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

    memberPermissions.set(member.id, permissions)
}
