import { Events, GuildMember, PartialGuildMember, Role } from "discord.js"
import { BotModule, Config, MessageOptionsBuilder, TransientRole, UserRejoinRoles } from "lib"

const LOG_CHANNEL = Config.declareType("Rejoin Roles Log Channel")

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
                const added: Role[] = []
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
                                .then(() => added.push(r))
                                .catch(console.error),
                        ),
                )

                if (added.length) {
                    this.bot.buildSendLogMessages(
                        LOG_CHANNEL,
                        [member.guild.id],
                        new MessageOptionsBuilder().setContent(
                            `:wave:  Got ${added.join(" ")} back after rejoining.`,
                        ),
                    )
                }
            }
        }
    }
}

export default StickyRolesModule.getInstance()
