import { Events, GuildMember, PartialGuildMember, Role } from "discord.js"
import { BotModule, Config, MessageOptionsBuilder, PositionRole, TransientRole, UserRejoinRoles } from "lib"

const LOG_CHANNEL = Config.declareType("Rejoin Roles Log Channel")

class StickyRolesModule extends BotModule {
    protected positionRoles: Set<string> = new Set()

    protected addListeners() {
        PositionRole.cache.on("add", (v) => this.positionRoles.add(v.roleId))
        PositionRole.cache.on("delete", (v) => {
            if (!PositionRole.cache.documents().find((d) => d.roleId === v.roleId))
                this.positionRoles.delete(v.roleId)
        })

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
                const log: Role[] = []
                await Promise.all(
                    rejoinRoles.roles
                        .map((r) => member.guild.roles.cache.get(r))
                        .filter((r): r is Role => r !== undefined)
                        .filter((r) => this.bot.hasRolePermissions(r))
                        .filter((r) => !r.permissions.has("Administrator"))
                        .filter((r) => !TransientRole.isTransient(r.id))
                        .map((r) =>
                            member.roles
                                .add(r)
                                .then(() => (this.positionRoles.has(r.id) ? log.push(r) : null))
                                .catch(console.error),
                        ),
                )

                if (log.length) {
                    this.bot.buildSendLogMessages(
                        LOG_CHANNEL,
                        [member.guild.id],
                        new MessageOptionsBuilder().setContent(
                            `:wave:  ${member} Got ${log.join(" ")} back after rejoining.`,
                        ),
                    )
                }
            }
        }
    }
}

export default StickyRolesModule.getInstance()
