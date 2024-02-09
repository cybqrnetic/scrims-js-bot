import { AuditLogEvent, Events, GuildMember, PartialGuildMember, Role, User } from "discord.js"
import {
    AuditedGuildBan,
    AuditedRoleUpdate,
    BotModule,
    Config,
    DiscordUtil,
    MessageOptionsBuilder,
    PositionRole,
} from "lib"

import { RANKS } from "@Constants"

const LOG_CHANNEL = Config.declareType("Positions Log Channel")

export class RoleSyncModule extends BotModule {
    addListeners() {
        this.bot.on(Events.GuildMemberAdd, (member) => this.onMemberAdd(member))
        this.bot.on(Events.GuildMemberRemove, (member) => this.onMemberRemove(member))
        this.bot.auditedEvents.on(AuditLogEvent.MemberBanAdd, (action) => this.onBanChange(action))
        this.bot.auditedEvents.on(AuditLogEvent.MemberBanRemove, (action) => this.onBanChange(action))
        this.bot.auditedEvents.on(AuditLogEvent.MemberRoleUpdate, (action) => this.onRolesChange(action))

        this.bot.on("initialized", () => this.onInitialized())
    }

    async onReady() {
        const start = Date.now()
        if (this.bot.host) {
            DiscordUtil.completelyFetch(this.bot.host.bans)
                .then(() => {
                    console.log(
                        `[Role Sync] Fetched ${this.bot.host?.bans.cache.size} ` +
                            `host bans in ${Date.now() - start}ms`,
                    )
                })
                .catch(console.error)
        }
    }

    async onInitialized() {
        if (this.bot.host) {
            await Promise.all(this.bot.users.cache.map((user) => this.syncUserRoles(user).catch(() => null)))
        }
    }

    get hostGuildId() {
        return this.bot.hostGuildId
    }

    async onMemberAdd(member: GuildMember | PartialGuildMember) {
        if (member.guild.id !== this.hostGuildId) await this.syncMemberRoles(member)
    }

    async onMemberRemove(member: GuildMember | PartialGuildMember) {
        if (member.guild.id === this.hostGuildId) await this.syncUserRoles(member.user, null)
    }

    async onBanChange({ guild, user, executor }: AuditedGuildBan) {
        if (guild.id === this.hostGuildId) await this.syncUserRoles(user, executor)
    }

    async onRolesChange({ guild, memberId, executor, added, removed }: AuditedRoleUpdate) {
        if (guild.id !== this.hostGuildId && executor.id === this.bot.user?.id) return

        const positionRoles = PositionRole.cache.filter((v) => v.guildId === guild.id)
        if (!positionRoles.find((v) => added.includes(v.roleId) || removed.includes(v.roleId))) return

        const member = await guild.members.fetch(memberId)
        if (member.guild.id === this.hostGuildId) await this.syncUserRoles(member.user, executor)
        else await this.syncMemberRoles(member)
    }

    async syncUserRoles(user: User, executor?: User | null) {
        await Promise.all(
            Array.from(this.bot.guilds.cache.values()).map(async (guild) => {
                if (guild.id !== this.hostGuildId && guild.members.resolve(user))
                    await this.syncMemberRoles(guild.members.resolve(user)!, executor)
            }),
        )
    }

    async syncMemberRoles(member: GuildMember | PartialGuildMember, executor?: User | null) {
        if (member.guild.id === this.hostGuildId) return

        const posRoles = PositionRole.cache.filter((v) => v.guildId === member.guild.id)
        const positions = this.bot.permissions.getUsersPositions(member.user)
        const forbidden = this.bot.permissions.getUsersForbiddenPositions(member.user)

        for (const rank of Object.values(RANKS).reverse()) {
            if (positions.has(rank)) {
                Object.values(RANKS)
                    .filter((v) => v !== rank)
                    .forEach((v) => {
                        positions.delete(v)
                        forbidden.add(v)
                    })
                break
            }
        }

        const add = PositionRole.resolvePermittedRoles(posRoles.filter((p) => positions.has(p.position)))
        const remove = PositionRole.resolvePermittedRoles(
            posRoles.filter((p) => forbidden.has(p.position)),
        ).filter((v) => !add.includes(v))

        const removeResults = await Promise.all(
            remove
                .filter((r) => member.roles.cache.has(r.id))
                .map((r) =>
                    member.roles
                        .remove(r, "Bridge Scrims Role Sync")
                        .then(() => r)
                        .catch((error) =>
                            console.error(`Unable to remove role because of ${error}!`, member.id, r.id),
                        ),
                ),
        ).then((v) => v.filter((v): v is Role => !!v))

        if (removeResults.length > 0 && executor !== undefined)
            this.logRolesLost(member, executor, removeResults)

        const createResults = await Promise.all(
            add
                .filter((r) => !member.roles.cache.has(r.id))
                .map((r) =>
                    member.roles
                        .add(r, "Bridge Scrims Role Sync")
                        .then(() => r)
                        .catch((error) =>
                            console.error(`Unable to give role because of ${error}!`, member.id, r.id),
                        ),
                ),
        ).then((v) => v.filter((v): v is Role => !!v))

        if (createResults.length > 0 && executor) this.logRolesGained(member, executor, createResults)
    }

    logRolesLost(member: GuildMember | PartialGuildMember, executor: User | null, roles: Role[]) {
        const origin = !executor ? "after leaving" : `because of ${executor}`
        this.bot.buildSendLogMessages(LOG_CHANNEL, [member.guild.id], () => {
            return new MessageOptionsBuilder().setContent(
                `:outbox_tray:  ${member} **Lost** ${roles.join(" ")} ${origin}.`,
            )
        })
    }

    logRolesGained(member: GuildMember | PartialGuildMember, executor: User, roles: Role[]) {
        this.bot.buildSendLogMessages(LOG_CHANNEL, [member.guild.id], () => {
            return new MessageOptionsBuilder().setContent(
                `:inbox_tray:  ${member} **Got** ${roles.join(" ")} from ${executor}.`,
            )
        })
    }
}

export default RoleSyncModule.getInstance()
