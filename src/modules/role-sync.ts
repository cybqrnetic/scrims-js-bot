import {
    AuditLogEvent,
    Events,
    GuildMember,
    PartialGuildMember,
    Role,
    SlashCommandBuilder,
    User,
} from "discord.js"

import { HOST_GUILD_ID, Positions, RANKS } from "@Constants"
import {
    AuditedGuildBan,
    AuditedRoleUpdate,
    BotModule,
    Config,
    DiscordUtil,
    MessageOptionsBuilder,
    PositionRole,
    SlashCommand,
    UserError,
} from "lib"

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
    addListeners() {
        this.bot.on(Events.GuildMemberAdd, (member) => this.onMemberAdd(member))
        this.bot.on(Events.GuildMemberRemove, (member) => this.onMemberRemove(member))
        this.bot.auditedEvents.on(AuditLogEvent.MemberBanAdd, (action) => this.onBanChange(action))
        this.bot.auditedEvents.on(AuditLogEvent.MemberBanRemove, (action) => this.onBanChange(action))
        this.bot.auditedEvents.on(AuditLogEvent.MemberRoleUpdate, (action) => this.onRolesChange(action))
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
        this.syncRoles().catch(console.error)
        setInterval(() => this.syncRoles(), 20 * 60 * 1000)
    }

    async syncRoles() {
        const host = this.bot.host
        if (!host) {
            console.warn(`[Role Sync] Host guild (${HOST_GUILD_ID}) not in cache!`)
            return
        }

        const expected = host.memberCount
        const before = host.members.cache.size
        const fetched = (await host.members.fetch()).size
        if (fetched !== before) {
            console.warn(
                `[Role Sync] Host members needed to be refreshed (${before} -> ${fetched}/${expected})!`,
            )
        }

        await Promise.all(this.bot.users.cache.map((user) => this.syncUserRoles(user).catch(console.error)))
    }

    async onMemberAdd(member: GuildMember | PartialGuildMember) {
        if (member.guild.id !== HOST_GUILD_ID) await this.syncMemberRoles(member)
    }

    async onMemberRemove(member: GuildMember | PartialGuildMember) {
        if (member.guild.id === HOST_GUILD_ID) await this.syncUserRoles(member.user, null)
    }

    async onBanChange({ guild, user, executor }: AuditedGuildBan) {
        if (guild.id === HOST_GUILD_ID) await this.syncUserRoles(user, executor)
    }

    async onRolesChange({ guild, memberId, executor, added, removed }: AuditedRoleUpdate) {
        if (guild.id !== HOST_GUILD_ID && executor.id === this.bot.user?.id) return

        const positionRoles = new Set(PositionRole.getGuildRoles(guild.id).map((v) => v.roleId))
        if (!added.concat(removed).find((v) => positionRoles.has(v))) return

        const member = await guild.members.fetch(memberId)
        if (member.guild.id === HOST_GUILD_ID) await this.syncUserRoles(member.user, executor)
        else await this.syncMemberRoles(member)
    }

    async syncUserRoles(user: User, executor?: User | null) {
        await Promise.all(
            Array.from(this.bot.guilds.cache.values()).map(async (guild) => {
                if (guild.id !== HOST_GUILD_ID && guild.members.resolve(user))
                    await this.syncMemberRoles(guild.members.resolve(user)!, executor)
            }),
        )
    }

    async syncMemberRoles(member: GuildMember | PartialGuildMember, executor?: User | null) {
        if (member.guild.id === HOST_GUILD_ID) return

        const forbidden = new Set<string>()
        const allowed = new Set<string>()

        for (const position of CONFIGURED_POSITIONS) {
            const permission = this.bot.permissions.hasOnlinePosition(member.user, position)
            if (permission === false) forbidden.add(position)
            else if (permission) allowed.add(position)
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

        const add = PositionRole.resolvePermittedRoles(
            Array.from(allowed).flatMap((pos) => PositionRole.getPositionRoles(pos, member.guild.id)),
        )

        const remove = PositionRole.resolvePermittedRoles(
            Array.from(forbidden).flatMap((pos) => PositionRole.getPositionRoles(pos, member.guild.id)),
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

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("sync-roles")
        .setDescription("Sync Bridge Scrims roles with partner servers")
        .setDMPermission(false)
        .setDefaultMemberPermissions("0"),

    config: { permissions: { positionLevel: Positions.Staff } },

    async handler(interaction) {
        const host = interaction.client.host
        if (!host) throw new UserError(`Host guild (${HOST_GUILD_ID}) not in cache!`)

        const guilds = Array.from(interaction.client.guilds.cache.filter((v) => v !== host).values())
        const members = guilds.reduce((pv, cv) => pv + cv.members.cache.size, 0)
        await interaction.reply({
            content: `Syncing ${members} member(s) over ${guilds.length} guild(s)...`,
            ephemeral: true,
        })

        const start = Date.now()
        await RoleSyncModule.getInstance().syncRoles()
        await interaction.followUp({ content: `Finished after ${Date.now() - start}ms`, ephemeral: true })
    },
})

export default RoleSyncModule.getInstance()
