import { Collection, GuildMember, User } from "discord.js"
import { getMainGuild } from "."

declare module "discord.js" {
    interface GuildMember {
        hasPermission(permission: string, checkAdmin?: boolean): boolean
    }

    interface User {
        hasPermission(permission: string, checkAdmin?: boolean): boolean
    }
}

User.prototype.hasPermission = function (permission, checkAdmin = true) {
    return checkAdmin && !!getMainGuild()?.members.cache.get(this.id)?.permissions.has("Administrator")
}

GuildMember.prototype.hasPermission = function (permission, checkAdmin) {
    return this.user.hasPermission(permission, checkAdmin)
}

export class Permissions {
    static getMembersWithPermission(permission: string, checkAdmin?: boolean) {
        const members = getMainGuild()?.members.cache ?? new Collection()
        return members.filter((m) => m.hasPermission(permission, checkAdmin))
    }
}
