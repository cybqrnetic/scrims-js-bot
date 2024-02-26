import {
    APIRole,
    AuditLogEvent,
    Channel,
    Client,
    ClientEvents,
    Events,
    Guild,
    GuildAuditLogsEntry,
    GuildChannel,
    GuildMember,
    NonThreadGuildBasedChannel,
    Snowflake,
    User,
} from "discord.js"
import { EventEmitter } from "events"

export class AuditedEventEmitter {
    protected events: EventEmitter = new EventEmitter({ captureRejections: true })

    constructor(protected readonly bot: Client) {
        this.events.on("error", console.error)
        this.bot.on(Events.GuildAuditLogEntryCreate, (...args) => this.onAuditLogEntry(...args))
    }

    async fetchExecutor<T extends { guild: Guild; executor: User | null }, E extends AuditLogEvent>(
        object: T,
        type: E,
        validator: (obj: T, log: GuildAuditLogsEntry<E>) => boolean,
    ) {
        const fetchedLogs = await object.guild
            .fetchAuditLogs({ limit: 3, type })
            .catch((error) => console.error(`Unable to fetch audit logs because of ${error}!`))

        if (fetchedLogs) {
            object.executor =
                fetchedLogs.entries
                    .filter((log) => validator(object, log))
                    .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
                    .first()?.executor ?? null
        }
        return object
    }

    async onAuditLogEntry(...[entry, guild]: ClientEvents[Events.GuildAuditLogEntryCreate]) {
        const { action, executorId, target, targetId, changes, reason } = entry
        const executor = executorId ? await this.bot.users.fetch(executorId).catch(() => null) : null
        if (!targetId || !executor) return

        const eventData = { guild, executor, reason, entry }

        if (action === AuditLogEvent.MemberBanAdd || action === AuditLogEvent.MemberBanRemove) {
            const target = await this.bot.users.fetch(targetId)
            this.emit(action, { ...eventData, user: target })
        }

        if (action === AuditLogEvent.ChannelCreate || action === AuditLogEvent.ChannelDelete) {
            let channel: Channel | null = target instanceof GuildChannel ? target : null
            if (!channel && action !== AuditLogEvent.ChannelDelete)
                channel = await this.bot.channels.fetch(targetId)
            this.emit(action, {
                ...eventData,
                channelId: targetId,
                channel: channel as NonThreadGuildBasedChannel | null,
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

    protected emit<K extends keyof ThisEvents>(event: K, ...args: ThisEvents[K]): boolean
    protected emit(eventName: string | number, ...args: any[]) {
        return this.events.emit(`${eventName}`, ...args)
    }

    on<K extends keyof ThisEvents>(event: K, listener: (...args: ThisEvents[K]) => unknown): this
    on(eventName: string | number, listener: (...args: any[]) => void) {
        this.events.on(`${eventName}`, listener)
        return this
    }
}

interface ThisEvents {
    [AuditLogEvent.MemberRoleUpdate]: [action: AuditedRoleUpdate]
    [AuditLogEvent.ChannelCreate]: [action: AuditedChannelAction]
    [AuditLogEvent.ChannelDelete]: [action: AuditedChannelAction]
    [AuditLogEvent.MemberBanRemove]: [ban: AuditedGuildBan]
    [AuditLogEvent.MemberBanAdd]: [ban: AuditedGuildBan]
}

interface AuditLogAction {
    guild: Guild
    executor: User
    reason: string | null
}

export interface AuditedGuildBan extends AuditLogAction {
    user: User
}

export interface AuditedChannelAction extends AuditLogAction {
    channel: NonThreadGuildBasedChannel | null
    channelId: Snowflake
}

export interface AuditedRoleUpdate extends AuditLogAction {
    member: GuildMember | null
    memberId: Snowflake
    added: Snowflake[]
    removed: Snowflake[]
}
