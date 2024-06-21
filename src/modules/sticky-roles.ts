import { Positions } from "@Constants"
import { Events, GuildMember, PartialGuildMember, Role } from "discord.js"
import { BotModule, PositionRole, UserRejoinRoles } from "lib"

class StickyRolesModule extends BotModule {
    protected addListeners() {
        this.bot.on(Events.GuildMemberRemove, (m) => this.onMemberRemove(m))
        this.bot.on(Events.GuildMemberAdd, (m) => this.onMemberAdd(m))
    }

    async onMemberRemove(member: GuildMember | PartialGuildMember) {
        if (member.guild.id === this.bot.hostGuildId) {
            const roles = member.roles.cache
                .filter((r) => !r.managed && r.id !== r.guild.id)
                .filter((r) => !this.alwaysIgnoredRoles().includes(r.id))
                .map((r) => r.id)

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
                        .filter((r) => !this.currentIgnoredRoles().includes(r.id))
                        .map((r) => member.roles.add(r)),
                )
            }
        }
    }

    currentIgnoredRoles() {
        return this.alwaysIgnoredRoles()
    }

    alwaysIgnoredRoles() {
        return PositionRole.getPositionRoles(Positions.Member, this.bot.hostGuildId).map((v) => v.roleId)
    }
}

export default StickyRolesModule.getInstance()
