import { Events, GuildMember, PartialGuildMember, Role } from "discord.js"
import { BotModule, MAIN_GUILD_ID, MessageOptionsBuilder } from "lib"

import { Config } from "@module/config"
import { PositionRole } from "@module/positions"
import { acquired } from "."
import { UserRejoinRoles } from "./RejoinRoles"
import { TransientRole } from "./TransientRole"

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
        if (member.guild.id !== MAIN_GUILD_ID) return

        await acquired(member.id, async () => {
            const roles = member.roles.cache.filter((r) => !r.managed && r.id !== r.guild.id).map((r) => r.id)
            if (roles.length) {
                await UserRejoinRoles.updateOne({ _id: member.id }, { roles }, { upsert: true })
            }
        })
    }

    async onMemberAdd(member: GuildMember) {
        if (member.guild.id !== MAIN_GUILD_ID) return

        await acquired(member.id, async () => {
            const rejoinRoles = await UserRejoinRoles.findByIdAndDelete(member.id)
            if (!rejoinRoles) return

            const log: Role[] = []
            await Promise.all(
                rejoinRoles.roles
                    .map((r) => member.guild.roles.cache.get(r))
                    .filter((r): r is Role => r !== undefined)
                    .filter((r) => r.editable)
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
                Config.buildSendLogMessages(
                    LOG_CHANNEL,
                    [member.guild.id],
                    new MessageOptionsBuilder().setContent(
                        `:wave:  ${member} Got ${log.join(" ")} back after rejoining.`,
                    ),
                )
            }
        })
    }
}

export default StickyRolesModule.getInstance()
