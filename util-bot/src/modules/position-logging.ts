import { HOST_GUILD_ID, Positions } from "@Constants"
import { AuditLogEvent, User, roleMention, userMention } from "discord.js"
import { AuditedRoleUpdate, BotModule, Config, MessageOptionsBuilder, PositionRole } from "lib"

const LOG_CHANNEL = Config.declareType("Positions Log Channel")

function onlyMemberRole(roles: string[]) {
    const memberRoles = new Set(PositionRole.getRoles(Positions.Member, HOST_GUILD_ID).map((v) => v.id))
    return roles.every((role) => memberRoles.has(role))
}

export class PositionsLogModule extends BotModule {
    protected addListeners() {
        this.bot.auditedEvents.on(AuditLogEvent.MemberRoleUpdate, (action) => this.onRolesChange(action))
    }

    async onRolesChange({ guild, memberId, executor, added, removed }: AuditedRoleUpdate) {
        if (executor.id === this.bot.user?.id) return
        if (guild.id !== this.bot.hostGuildId) return

        const logRoles = new Set(
            PositionRole.cache.filter((v) => v.guildId === guild.id).map((v) => v.roleId),
        )

        removed = removed.filter((role) => logRoles.has(role))
        added = added.filter((role) => logRoles.has(role))

        if (removed.length && !onlyMemberRole(removed)) {
            this.logRolesLost(memberId, executor, removed)
        }

        if (added.length && !onlyMemberRole(added)) {
            this.logRolesGained(memberId, executor, added)
        }
    }

    logRolesLost(memberId: string, executor: User, roles: string[]) {
        this.bot.buildSendLogMessages(LOG_CHANNEL, [HOST_GUILD_ID], () => {
            return new MessageOptionsBuilder().setContent(
                `:outbox_tray:  ${userMention(memberId)} ` +
                    `**Lost** ${roles.map(roleMention).join(" ")} because of ${executor}.`,
            )
        })
    }

    logRolesGained(memberId: string, executor: User, roles: string[]) {
        this.bot.buildSendLogMessages(LOG_CHANNEL, [HOST_GUILD_ID], () => {
            return new MessageOptionsBuilder().setContent(
                `:inbox_tray:  ${userMention(memberId)} ` +
                    `**Got** ${roles.map(roleMention).join(" ")} from ${executor}.`,
            )
        })
    }
}

export default PositionsLogModule.getInstance()
