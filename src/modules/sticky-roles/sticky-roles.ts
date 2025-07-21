import { Events, GuildMember, PartialGuildMember, Role } from "discord.js"
import { BotModule, MAIN_GUILD_ID, MessageOptionsBuilder } from "lib"

import { Config } from "@module/config"
import { PositionRole } from "@module/positions"
import { acquired } from "./OfflinePositions"
import { UserRejoinRoles } from "./RejoinRoles"
import { TransientRole } from "./TransientRole"

const LOG_CHANNEL = Config.declareType("Rejoin Roles Log Channel")

class StickyRolesModule extends BotModule {
    protected addListeners() {
        this.bot.on(Events.GuildMemberRemove, (m) => this.onMemberRemove(m))
        this.bot.on(Events.GuildMemberAdd, (m) => this.onMemberAdd(m))
    }

    async onMemberRemove(member: GuildMember | PartialGuildMember) {
        if (member.guild.id !== MAIN_GUILD_ID) return

        await acquired(member.id, async () => {
            const roles = member.roles.cache.filter((r) => !r.managed && r.id !== r.guild.id).map((r) => r.id)
            if (roles.length) {
                await UserRejoinRoles.updateOne(
                    { _id: member.id },
                    { $addToSet: { roles: { $each: roles } } },
                    { upsert: true },
                )
            }
        })
    }

    async onMemberAdd(member: GuildMember) {
        if (member.guild.id !== MAIN_GUILD_ID) return

        await acquired(member.id, async () => {
            const document = await UserRejoinRoles.findById(member.id)
            if (document) {
                const roles = member.roles.cache
                const readdRoles = document
                    .getRoles()
                    .filter((id) => !roles.has(id))
                    .map((id) => member.guild.roles.cache.get(id))
                    .filter((r) => r instanceof Role)
                    .filter((r) => r.editable)
                    .filter((r) => !r.permissions.has("Administrator"))
                    .filter((r) => !TransientRole.isTransient(r.id))

                await member.roles.add(readdRoles, "Sticky Roles")
                await document.deleteOne().catch(console.error)

                const log = readdRoles.filter((v) => PositionRole.declaredRoles().has(v.id))
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
