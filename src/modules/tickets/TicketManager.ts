import {
    AuditLogEvent,
    CategoryChannel,
    ChannelType,
    Collection,
    Events,
    GuildChannelCreateOptions,
    GuildMember,
    OverwriteData,
    PartialGuildMember,
    PermissionFlagsBits,
    PermissionResolvable,
    User,
    channelMention,
    type BaseInteraction,
    type GuildTextBasedChannel,
} from "discord.js"

import { AuditedChannelAction, BotListener, DiscordBot, LocalizedError, PersistentData, UserError } from "lib"

import { Config } from "@module/config"
import { OnlinePositions, PositionRole } from "@module/positions"
import { Ticket } from "./Ticket"
import TicketTranscriber, { TicketTranscriberOptions } from "./TicketTranscriber"

const CLOSE_REASONS = {
    CreatorLeft: "closed this ticket because of the person leaving the server",
    ChannelMissing: "closed this ticket because of the channel no longer existing",
    ChannelDeletedAudited: "deleted the ticket channel",
    ChannelDeletedUnaudited: "closed this ticket after someone deleted the channel",
}

interface CloseTimeout {
    ticketId: string
    messageId: string
    timestamp: number
    closerId: string
    reason?: string
}

export interface TicketManagerConfig {
    permission?: string
    blackListed?: string | null
    transcript?: TicketTranscriberOptions | false
    commonCloseReasons?: string[]
    closeIfLeave?: boolean
    cooldown?: number
    userLimit?: number
    creatorPermissions?: PermissionResolvable
}

DiscordBot.useBot((bot) => {
    Object.values(TicketManager.managers).forEach((m) => Object.defineProperty(m, "bot", { value: bot }))
    Object.values(TicketManager.managers).forEach((m) => m.__addListeners())
})

const persistentTimeouts = new PersistentData(
    "TicketCloseTimeouts",
    new Map<string, Set<CloseTimeout>>(),
    (data) => Array.from(data.entries()).map(([k, v]): [string, CloseTimeout[]] => [k, Array.from(v)]),
    (from, data) =>
        new Map(
            data
                .filter(([k, v]) => TicketManager.getManager(k))
                .map(([k, v]): [string, Set<CloseTimeout>] => [k, new Set(v)]),
        ),
)

BotListener("initialized", () => {
    deleteGhostTicketsLoop()
    persistentTimeouts.load()
})

export class TicketManager {
    private static ticketManagers: Record<string, TicketManager> = {}

    static get managers() {
        return Object.values(this.ticketManagers)
    }

    static getManager(type: string) {
        return this.ticketManagers[type]
    }

    static async findTicket<Extras extends object>(interaction: BaseInteraction) {
        const ticket = await Ticket.findOne({ channelId: interaction.channelId! })
        if (!ticket) throw new LocalizedError("tickets.none")
        const ticketManager = TicketManager.getManager(ticket.type)
        if (!ticketManager)
            throw new UserError(
                "I am not responsible for these types of tickets. Maybe try a different integration.",
            )
        return { ticket: ticket as Ticket<Extras>, ticketManager }
    }

    private readonly bot!: DiscordBot
    private readonly transcriber?: TicketTranscriber
    private readonly guildConfig

    private readonly timeouts: Promise<Set<CloseTimeout>>
    private readonly timeoutIndex = new Map<string, Set<CloseTimeout>>()
    private readonly timeoutTimers = new Map<CloseTimeout, Timer>()
    private ticketChannels = new Set<string>()

    constructor(
        readonly type: string,
        readonly options: TicketManagerConfig = {},
    ) {
        this.guildConfig = Config.declareTypes({ Category: `Tickets ${this.type} Category` })
        Config.declareType(`${this.type} Transcripts Channel`)

        if (options.blackListed === undefined)
            options.blackListed = PositionRole.declarePosition(`${this.type} Blacklisted`)

        if (options.creatorPermissions === undefined)
            options.creatorPermissions = [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.AddReactions,
            ]

        if (options.transcript !== false) this.transcriber = new TicketTranscriber(options.transcript)

        this.timeouts = persistentTimeouts.get(false).then((v) => {
            const timeouts = v.get(type) ?? new Set()
            v.set(type, timeouts)
            timeouts.forEach((v) => this.startCloseTimeout(v))
            return timeouts
        })

        TicketManager.ticketManagers[type] = this
    }

    private ticketShouldExist(ticket: Ticket) {
        return (
            !this.bot.guilds.cache.get(ticket.guildId)?.members?.me ||
            this.bot.channels.cache.get(ticket.channelId)
        )
    }

    async deleteGhostTickets(tickets: Ticket[]) {
        this.ticketChannels = new Set(tickets.map((v) => v.channelId))
        await Promise.all(
            tickets
                .filter((v) => !this.ticketShouldExist(v))
                .map((v) =>
                    this.closeTicket(v.id, undefined, CLOSE_REASONS.ChannelMissing).catch(console.error),
                ),
        )
    }

    __addListeners() {
        this.bot.on(Events.GuildMemberRemove, (member) => this.onMemberRemove(member))
        this.bot.on(Events.MessageDelete, (msg) => this.cancelCloseTimeouts(msg.id))
        this.bot.auditedEvents.on(AuditLogEvent.ChannelDelete, (channel) => this.onChannelDelete(channel))
    }

    getCloseTimeouts() {
        return Array.from(this.timeoutTimers.keys())
    }

    cancelCloseTimeouts(resolvable: string) {
        const timeouts = this.timeoutIndex.get(resolvable)
        if (timeouts) {
            this.timeoutIndex.delete(resolvable)
            for (const timeout of timeouts) {
                this.timeoutIndex.get(timeout.ticketId)?.delete(timeout)
                this.timeoutIndex.get(timeout.messageId)?.delete(timeout)
                clearTimeout(this.timeoutTimers.get(timeout))
                this.timeoutTimers.delete(timeout)
                this.timeouts.then((v) => v.delete(timeout))
            }
        }
    }

    private addCloseTimeoutIndex(key: string, timeout: CloseTimeout) {
        if (!this.timeoutIndex.get(key)?.add(timeout)) {
            this.timeoutIndex.set(key, new Set([timeout]))
        }
    }

    private startCloseTimeout(timeout: CloseTimeout) {
        const time = Math.max(0, timeout.timestamp - Date.now())

        this.addCloseTimeoutIndex(timeout.ticketId, timeout)
        this.addCloseTimeoutIndex(timeout.messageId, timeout)

        this.timeoutTimers.set(
            timeout,
            setTimeout(
                () =>
                    this.closeTicket(timeout.ticketId, timeout.closerId, timeout.reason).catch(console.error),
                time,
            ),
        )
    }

    async addCloseTimeout(timeout: CloseTimeout) {
        const timeouts = await this.timeouts
        timeouts.add(timeout)
        this.startCloseTimeout(timeout)
    }

    getTicketCategory(guildId: string) {
        const id = Config.getConfigValue(this.guildConfig.Category, guildId)
        if (id) return (this.bot.channels.cache.get(id) as CategoryChannel) ?? null
        return null
    }

    async createChannel(member: GuildMember, channelOptions: Partial<GuildChannelCreateOptions> = {}) {
        const parent = this.getTicketCategory(member.guild.id)
        if (parent) channelOptions.parent = parent

        if (!channelOptions.name) channelOptions.name = `${this.type}-${member.user.username}`
        if (!channelOptions.type) channelOptions.type = ChannelType.GuildText

        const parentOverwrites = parent?.permissionOverwrites.cache ?? new Collection()
        const parentOverwriteData = Array.from(parentOverwrites.values()) as OverwriteData[]
        channelOptions.permissionOverwrites = parentOverwriteData.concat(
            {
                id: member.guild.id,
                allow: parentOverwrites.get(member.guild.id)?.allow.remove(PermissionFlagsBits.ViewChannel),
                deny:
                    parentOverwrites.get(member.guild.id)?.deny.add(PermissionFlagsBits.ViewChannel) ??
                    PermissionFlagsBits.ViewChannel,
            },
            {
                id: member.id,
                allow: this.options.creatorPermissions,
                deny: parentOverwrites.get(member.id)?.deny,
            },
        )

        const channel = await member.guild.channels.create(channelOptions as GuildChannelCreateOptions)
        this.ticketChannels.add(channel.id)
        return channel
    }

    async channelTicket(channelId: string) {
        return Ticket.findOne({ channelId, type: this.type })
    }

    async verifyTicketRequest(user: User, guildId: string) {
        if (this.options.blackListed) {
            const blacklisted = OnlinePositions.hasPosition(user, this.options.blackListed)
            if (blacklisted) throw new LocalizedError("tickets.blacklisted")
        }

        const existing = await Ticket.find({ guildId, userId: user.id, type: this.type, status: "open" })
        existing
            .filter((ticket) => !this.ticketShouldExist(ticket))
            .forEach((ticket) =>
                this.closeTicket(ticket.id, undefined, CLOSE_REASONS.ChannelMissing).catch(console.error),
            )

        const stillExisting = existing.filter((ticket) => this.ticketShouldExist(ticket))
        if (stillExisting.length >= (this.options.userLimit ?? 1)) {
            if (stillExisting.length > 1)
                throw new LocalizedError("tickets.user_limit", `${this.options.userLimit}`)
            throw new LocalizedError("tickets.existing", `${channelMention(stillExisting[0]!.channelId)}`)
        }

        const pvTicket = await Ticket.findOne({
            guildId,
            userId: user.id,
            type: this.type,
        }).sort({ createdAt: -1 })

        if (
            pvTicket &&
            this.options.cooldown &&
            (Date.now() - pvTicket.createdAt!.valueOf()) / 1000 < this.options.cooldown
        )
            throw new LocalizedError(
                "tickets.cooldown",
                Math.floor(pvTicket.createdAt!.valueOf() / 1000 + this.options.cooldown),
            )

        return true
    }

    async onChannelDelete({ channelId, executor }: AuditedChannelAction) {
        if (!this.ticketChannels.has(channelId)) return
        this.ticketChannels.delete(channelId)

        const ticket = await this.channelTicket(channelId)
        if (!ticket) return

        if (executor) await this.closeTicket(ticket.id, executor.id, CLOSE_REASONS.ChannelDeletedAudited)
        else await this.closeTicket(ticket.id, undefined, CLOSE_REASONS.ChannelDeletedUnaudited)
    }

    async closeTicket(ticketId: string, closerId?: string, reason?: string) {
        this.cancelCloseTimeouts(ticketId)
        const ticket = await Ticket.findOneAndUpdate(
            { _id: ticketId, status: { $ne: "deleted" } },
            { status: "deleted", closerId, closeReason: reason, deletedAt: new Date() },
        )

        if (!ticket) return

        const guild = this.bot.guilds.cache.get(ticket.guildId)
        const channel = await this.bot.channels.fetch(ticket.channelId).catch(() => null)
        if (this.transcriber && guild && channel?.isTextBased()) {
            await this.transcriber.send(guild, ticket, channel as GuildTextBasedChannel).catch(console.error)
        }

        if (channel) {
            this.ticketChannels.delete(ticket.channelId)
            await channel.delete().catch(() => null)
        }
    }

    async onMemberRemove(member: GuildMember | PartialGuildMember) {
        if (this.options.closeIfLeave === false) return

        const tickets = await Ticket.find({ userId: member.id, type: this.type })
        await Promise.allSettled(
            tickets.map((ticket) =>
                this.closeTicket(ticket.id, undefined, CLOSE_REASONS.CreatorLeft).catch((err) =>
                    console.error(`Error while automatically closing ticket ${ticket.id}!`, err),
                ),
            ),
        )
    }
}

function deleteGhostTicketsLoop() {
    deleteGhostTickets()
        .catch(console.error)
        .finally(() => {
            setTimeout(deleteGhostTicketsLoop, 5 * 60 * 1000)
        })
}

async function deleteGhostTickets() {
    const tickets = await Ticket.find({ status: { $ne: "deleted" } })
    const ticketTypes = new Map<string, Ticket[]>()
    for (const ticket of tickets) {
        if (!ticketTypes.get(ticket.type)?.push(ticket)) {
            ticketTypes.set(ticket.type, [ticket])
        }
    }

    await Promise.all(
        Object.values(TicketManager.managers).map((m) => m.deleteGhostTickets(ticketTypes.get(m.type) ?? [])),
    )
}
