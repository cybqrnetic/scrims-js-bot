import { Events, GuildMember, PartialGuildMember, Role } from "discord.js"
import { BotModule, UserRejoinRoles } from "lib"
import { TransientRole } from "../lib/db/models/TransientRole"

class StickyRolesModule extends BotModule {
    protected addListeners() {
        this.bot.on(Events.GuildMemberRemove, (m) => this.onMemberRemove(m))
        this.bot.on(Events.GuildMemberAdd, (m) => this.onMemberAdd(m))
    }

    async onMemberRemove(member: GuildMember | PartialGuildMember) {
        if (member.guild.id === this.bot.hostGuildId) {
            const roles = member.roles.cache.filter((r) => !r.managed && r.id !== r.guild.id).map((r) => r.id)

            if (roles.length) {
                await UserRejoinRoles.updateOne({ _id: member.id }, { roles }, { upsert: true })
            }
        }
    }

    async onMemberAdd(member: GuildMember) {
        if (member.guild.id === this.bot.hostGuildId) {
            const rejoinRoles = await UserRejoinRoles.findByIdAndDelete(member.id)
            if (rejoinRoles) {
                await Promise.all(
                    rejoinRoles.roles
                        .map((r) => member.guild.roles.cache.get(r.toString()))
                        .filter((r): r is Role => r !== undefined)
                        .filter((r) => this.bot.hasRolePermissions(r))
                        .filter((r) => !r.permissions.has("Administrator"))
                        .filter((r) => !TransientRole.isTransient(r.id))
                        .map((r) => member.roles.add(r)),
                )
            }
        }
    }
}

export default StickyRolesModule.getInstance()
