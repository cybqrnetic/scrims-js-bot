import { Collection, GuildMember, User } from "discord.js"
import { DiscordBot } from "./DiscordBot"

declare module "discord.js" {
    interface GuildMember {
        hasPermission(permission: string): boolean
    }

    interface User {
        hasPermission(permission: string): boolean
    }
}

User.prototype.hasPermission = function (_permission: string) {
    return (
        DiscordBot.getInstance().host?.members.cache.get(this.id)?.permissions.has("Administrator") ?? false
    )
}

GuildMember.prototype.hasPermission = function (permission: string) {
    return this.user.hasPermission(permission)
}

export class Permissions {
    static getMembersWithPermission(permission: string) {
        const members = DiscordBot.getInstance().host?.members.cache ?? new Collection()
        return members.filter((m) => m.hasPermission(permission))
    }
}
