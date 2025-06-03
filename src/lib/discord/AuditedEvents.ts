import {
    APIRole,
    AuditLogEvent,
    Client,
    ClientEvents,
    DMChannel,
    Events,
    Guild,
    GuildAuditLogsEntry,
    GuildMember,
    NonThreadGuildBasedChannel,
    Snowflake,
    User,
} from "discord.js"
import { EventEmitter } from "events"

export class AuditedEventEmitter {
    private events: EventEmitter = new EventEmitter({ captureRejections: true })

    constructor(private readonly bot: Client) {
        this.events.on("error", console.error)
        this.bot.on(Events.GuildAuditLogEntryCreate, (...args) => this.onAuditLogEntry(...args))
        this.bot.on(Events.ChannelDelete, (channel) => this.onChannelDelete(channel))
    }

    async fetchLogEntry<E extends AuditLogEvent>(
        guild: Guild,
        type: E,
        validator: (log: GuildAuditLogsEntry<E>) => boolean,
    ) {
        const fetchedLogs = await guild
            .fetchAuditLogs({ limit: 3, type })
            .catch((error) => console.error(`Unable to fetch audit logs because of ${error}!`))

        return fetchedLogs?.entries
            .filter((log) => validator(log as GuildAuditLogsEntry<E>))
            .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
            .first()
    }

    private async onChannelDelete(channel: NonThreadGuildBasedChannel | DMChannel) {
        if (channel.isDMBased()) return

        const entry = await this.fetchLogEntry(
            channel.guild,
            AuditLogEvent.ChannelDelete,
            (entry) => entry.targetId === channel.id,
        )

        const executor = await entry?.executor?.fetch()
        this.emit(AuditLogEvent.ChannelDelete, {
            guild: channel.guild,
            channel,
            channelId: channel.id,
            executor,
            reason: entry?.reason ?? null,
        })
    }

    private async onAuditLogEntry(...[entry, guild]: ClientEvents[Events.GuildAuditLogEntryCreate]) {
        const { action, executorId, target, targetId, changes, reason } = entry
        if (!targetId || !executorId) return

        const executor = await this.bot.users.fetch(executorId)
        const eventData = { guild, executor, reason }

        if (action === AuditLogEvent.MemberBanAdd || action === AuditLogEvent.MemberBanRemove) {
            const target = await this.bot.users.fetch(targetId)
            this.emit(action, { ...eventData, user: target })
        }

        if (action === AuditLogEvent.ChannelCreate && target !== null) {
            this.emit(action, {
                ...eventData,
                channelId: targetId,
                channel: target as NonThreadGuildBasedChannel,
            })
        }

        if (action === AuditLogEvent.MemberRoleUpdate) {
            const added = (changes.find((change) => change.key === "$add")?.new ?? []) as APIRole[]
            const removed = (changes.find((change) => change.key === "$remove")?.new ?? []) as APIRole[]
            this.emit(action, {
                ...eventData,
                memberId: targetId,
                member: guild.members.resolve(targetId),
                removed: removed.map((role) => role.id),
                added: added.map((role) => role.id),
            })
        }
    }

    protected emit<K extends keyof AuditedEvents>(event: K, ...args: AuditedEvents[K]): boolean
    protected emit(eventName: string | number, ...args: unknown[]) {
        return this.events.emit(`${eventName}`, ...args)
    }

    on<K extends keyof AuditedEvents>(event: K, listener: (...args: AuditedEvents[K]) => unknown): this
    on(eventName: string | number, listener: (...args: unknown[]) => void) {
        this.events.on(`${eventName}`, listener)
        return this
    }
}

export interface AuditedEvents {
    [AuditLogEvent.MemberRoleUpdate]: [action: AuditedRoleUpdate]
    [AuditLogEvent.ChannelCreate]: [action: AuditedChannelAction]
    [AuditLogEvent.ChannelDelete]: [action: AuditedChannelAction]
    [AuditLogEvent.MemberBanRemove]: [ban: AuditedGuildBan]
    [AuditLogEvent.MemberBanAdd]: [ban: AuditedGuildBan]
}

interface AuditLogAction<E extends boolean> {
    guild: Guild
    executor: E extends true ? User : User | undefined
    reason: string | null
}

export interface AuditedGuildBan extends AuditLogAction<true> {
    user: User
}

export interface AuditedChannelAction extends AuditLogAction<false> {
    channel: NonThreadGuildBasedChannel
    channelId: Snowflake
}

export interface AuditedRoleUpdate extends AuditLogAction<true> {
    executor: User
    member: GuildMember | null
    memberId: Snowflake
    added: Snowflake[]
    removed: Snowflake[]
}
