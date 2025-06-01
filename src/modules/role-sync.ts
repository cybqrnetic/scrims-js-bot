import {
    AuditLogEvent,
    Events,
    GuildMember,
    MessageFlags,
    PartialGuildMember,
    Role,
    SlashCommandBuilder,
    User,
} from "discord.js"

import {
    auditedEvents,
    AuditedGuildBan,
    AuditedRoleUpdate,
    bot,
    BotModule,
    DiscordUtil,
    getMainGuild,
    MessageOptionsBuilder,
    SlashCommand,
    UserError,
} from "lib"

import { MAIN_GUILD_ID, RANKS } from "@Constants"
import { Config } from "@module/config"
import { OnlinePositions, PositionRole, Positions } from "@module/positions"
import { membersFetched } from "./member-fetcher"

const LOG_CHANNEL = Config.declareType("Positions Log Channel")
const CONFIGURED_POSITIONS = new Set<string>()

PositionRole.cache.on("add", (posRole) => {
    CONFIGURED_POSITIONS.add(posRole.position)
})

PositionRole.cache.on("delete", (posRole) => {
    if (!PositionRole.cache.find((v) => v.position === posRole.position)) {
        CONFIGURED_POSITIONS.delete(posRole.position)
    }
})

export class RoleSyncModule extends BotModule {
    readonly bans = Promise.withResolvers<void>()

    addListeners() {
        bot.on(Events.GuildMemberAdd, (member) => this.onMemberAdd(member))
        bot.on(Events.GuildMemberRemove, (member) => this.onMemberRemove(member))
        auditedEvents.on(AuditLogEvent.MemberBanAdd, (action) => this.onBanChange(action))
        auditedEvents.on(AuditLogEvent.MemberBanRemove, (action) => this.onBanChange(action))
        auditedEvents.on(AuditLogEvent.MemberRoleUpdate, (action) => this.onRolesChange(action))
    }

    onReady() {
        const guild = getMainGuild()
        if (!guild) {
            console.warn(`[Role Sync] Host guild not available!`)
            return
        }

        const start = Date.now()
        DiscordUtil.completelyFetch(guild.bans)
            .then(() => {
                console.log(
                    `[Role Sync] Fetched ${guild.bans.cache.size} host bans in ${Date.now() - start}ms`,
                )
            })
            .catch(console.error)
            .finally(() => this.bans.resolve())

        this.syncRoles().catch(console.error)
        setInterval(() => this.syncRoles(), 20 * 60 * 1000)
    }

    async syncRoles() {
        await Promise.all(this.bot.users.cache.map((user) => this.syncUserRoles(user).catch(console.error)))
    }

    async onMemberAdd(member: GuildMember | PartialGuildMember) {
        if (member.guild.id !== MAIN_GUILD_ID) await this.syncMemberRoles(member)
    }

    async onMemberRemove(member: GuildMember | PartialGuildMember) {
        if (member.guild.id === MAIN_GUILD_ID) await this.syncUserRoles(member.user, null)
    }

    async onBanChange({ guild, user, executor }: AuditedGuildBan) {
        if (guild.id === MAIN_GUILD_ID) await this.syncUserRoles(user, executor)
    }

    async onRolesChange({ guild, memberId, executor, added, removed }: AuditedRoleUpdate) {
        if (guild.id !== MAIN_GUILD_ID && executor.id === this.bot.user?.id) return

        const positionRoles = new Set(PositionRole.getGuildRoles(guild.id).map((v) => v.roleId))
        if (!added.concat(removed).find((v) => positionRoles.has(v))) return

        const member = await guild.members.fetch(memberId)
        if (member.guild.id === MAIN_GUILD_ID) await this.syncUserRoles(member.user, executor)
        else await this.syncMemberRoles(member)
    }

    async syncUserRoles(user: User, executor?: User | null) {
        await membersFetched()
        await Promise.all(
            Array.from(this.bot.guilds.cache.values()).map(async (guild) => {
                if (guild.id !== MAIN_GUILD_ID && guild.members.resolve(user))
                    await this.syncMemberRoles(guild.members.resolve(user)!, executor)
            }),
        )
    }

    async syncMemberRoles(member: GuildMember | PartialGuildMember, executor?: User | null) {
        if (member.guild.id === MAIN_GUILD_ID) return

        await this.bans.promise
        await membersFetched()

        const forbidden = new Set<string>()
        const allowed = new Set<string>()

        for (const position of CONFIGURED_POSITIONS) {
            const permission =
                position === Positions.Banned
                    ? getMainGuild()?.bans.cache.has(member.id)
                    : OnlinePositions.hasPosition(member.user, position)

            if (permission === true) allowed.add(position)
            else if (permission === false) forbidden.add(position)
        }

        for (const rank of Object.values(RANKS).reverse()) {
            if (allowed.has(rank)) {
                Object.values(RANKS)
                    .filter((v) => v !== rank)
                    .forEach((v) => {
                        allowed.delete(v)
                        forbidden.add(v)
                    })
                break
            }
        }

        const add = Array.from(allowed).flatMap((pos) => PositionRole.getPositionRoles(pos, member.guild.id))
        const addRoles = new Set(add.map((v) => v.roleId))

        const remove = Array.from(forbidden)
            .flatMap((pos) => PositionRole.getPositionRoles(pos, member.guild.id))
            .filter((v) => !addRoles.has(v.roleId))

        const [removed, added] = await Promise.all([
            Promise.all(
                PositionRole.resolvePermittedRoles(remove)
                    .filter((r) => member.roles.cache.has(r.id))
                    .map((r) =>
                        member.roles
                            .remove(r, "Bridge Scrims Role Sync")
                            .then(() => r)
                            .catch((error) =>
                                console.error(`Unable to remove role because of ${error}!`, member.id, r.id),
                            ),
                    ),
            ).then((results) => results.filter((role): role is Role => role !== undefined)),
            Promise.all(
                PositionRole.resolvePermittedRoles(add)
                    .filter((r) => !member.roles.cache.has(r.id))
                    .map((r) =>
                        member.roles
                            .add(r, "Bridge Scrims Role Sync")
                            .then(() => r)
                            .catch((error) =>
                                console.error(`Unable to give role because of ${error}!`, member.id, r.id),
                            ),
                    ),
            ).then((results) => results.filter((role): role is Role => role !== undefined)),
        ])

        if (removed.length > 0 && executor !== undefined) {
            this.logRolesLost(member, executor, removed)
        }

        if (added.length > 0 && executor) {
            this.logRolesGained(member, executor, added)
        }
    }

    logRolesLost(member: GuildMember | PartialGuildMember, executor: User | null, roles: Role[]) {
        const origin = !executor ? "after leaving" : `because of ${executor}`
        Config.buildSendLogMessages(LOG_CHANNEL, [member.guild.id], () => {
            return new MessageOptionsBuilder().setContent(
                `:outbox_tray:  ${member} **Lost** ${roles.join(" ")} ${origin}.`,
            )
        })
    }

    logRolesGained(member: GuildMember | PartialGuildMember, executor: User, roles: Role[]) {
        Config.buildSendLogMessages(LOG_CHANNEL, [member.guild.id], () => {
            return new MessageOptionsBuilder().setContent(
                `:inbox_tray:  ${member} **Got** ${roles.join(" ")} from ${executor}.`,
            )
        })
    }
}

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("sync-roles")
        .setDescription("Sync Bridge Scrims roles with partner servers"),

    config: { restricted: true },

    async handler(interaction) {
        const guild = getMainGuild()
        if (!guild) throw new UserError(`Main guild unavailable!`)

        const guilds = Array.from(interaction.client.guilds.cache.filter((v) => v !== guild).values())
        const members = guilds.reduce((pv, cv) => pv + cv.members.cache.size, 0)
        await interaction.reply({
            content: `Syncing ${members} member(s) over ${guilds.length} guild(s)...`,
            flags: MessageFlags.Ephemeral,
        })

        const start = Date.now()
        await RoleSyncModule.getInstance().syncRoles()
        await interaction.followUp({
            content: `Finished in ${Date.now() - start}ms`,
            flags: MessageFlags.Ephemeral,
        })
    },
})

export default RoleSyncModule.getInstance()
