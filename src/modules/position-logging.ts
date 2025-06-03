import { AuditLogEvent, roleMention, User, userMention } from "discord.js"
import { auditedEvents, AuditedRoleUpdate, BotModule, MAIN_GUILD_ID, MessageOptionsBuilder } from "lib"

import { Config } from "@module/config"
import { PositionRole, Positions } from "@module/positions"

const LOG_CHANNEL = Config.declareType("Positions Log Channel")

function onlyMemberRole(roles: string[]) {
    const memberRoles = new Set(PositionRole.getRoles(Positions.Member, MAIN_GUILD_ID).map((v) => v.id))
    return roles.every((role) => memberRoles.has(role))
}

export class PositionsLogModule extends BotModule {
    protected addListeners() {
        auditedEvents.on(AuditLogEvent.MemberRoleUpdate, (action) => this.onRolesChange(action))
    }

    onRolesChange({ guild, memberId, executor, added, removed }: AuditedRoleUpdate) {
        if (executor.id === this.bot.user?.id) return
        if (guild.id !== MAIN_GUILD_ID) return

        const logRoles = new Set(PositionRole.getGuildRoles(guild.id).map((v) => v.roleId))

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
        Config.buildSendLogMessages(LOG_CHANNEL, [MAIN_GUILD_ID], () => {
            return new MessageOptionsBuilder().setContent(
                `:outbox_tray:  ${userMention(memberId)} ` +
                    `**Lost** ${roles.map(roleMention).join(" ")} because of ${executor}.`,
            )
        })
    }

    logRolesGained(memberId: string, executor: User, roles: string[]) {
        Config.buildSendLogMessages(LOG_CHANNEL, [MAIN_GUILD_ID], () => {
            return new MessageOptionsBuilder().setContent(
                `:inbox_tray:  ${userMention(memberId)} ` +
                    `**Got** ${roles.map(roleMention).join(" ")} from ${executor}.`,
            )
        })
    }
}

export default PositionsLogModule.getInstance()
