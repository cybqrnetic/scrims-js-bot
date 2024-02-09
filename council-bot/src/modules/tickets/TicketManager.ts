import {
    AuditLogEvent,
    CategoryChannel,
    ChannelType,
    Collection,
    Events,
    GuildChannelCreateOptions,
    GuildMember,
    Message,
    OverwriteData,
    PartialGuildMember,
    PermissionFlagsBits,
    PermissionResolvable,
    TextChannel,
    User,
    channelMention,
    time,
} from "discord.js"

import {
    AuditedChannelAction,
    CommandHandlerInteraction,
    Config,
    LocalizedError,
    Permissions,
    PositionRole,
    ScrimsBot,
    Ticket,
    UserError,
    redis,
} from "lib"

import { DateTime } from "luxon"
import TicketTranscriber, { TicketTranscriberOptions } from "./TicketTranscriber"

const CLOSE_REASONS = {
    CreatorLeft: "closed this ticket because of the person leaving the server",
    ChannelMissing: "closed this ticket because of the channel no longer existing",
    ChannelDeletedAudited: "deleted the ticket channel",
    ChannelDeletedUnaudited: "closed this ticket after someone deleted the channel",
}

interface TicketCloseTimeout {
    ticketId: string
    channelId: string
    messageId: string
    /** timestamp in seconds */
    timestamp: number
    closerId: string
    reason?: string
    timeout: NodeJS.Timeout
}

export interface TicketManagerConfig {
    permissions?: Permissions
    blackListed?: string | null
    transcript?: TicketTranscriberOptions | false
    commonCloseReasons?: string[]
    closeIfLeave?: boolean
    cooldown?: number
    userLimit?: number
    creatorPermissions?: PermissionResolvable
}

ScrimsBot.useBot((bot) => {
    Object.values(TicketManager.managers).forEach((m) => Object.defineProperty(m, "bot", { value: bot }))
    Object.values(TicketManager.managers).forEach((m) => m.__addListeners())

    deleteGhostTicketsLoop()
    restoreCloseTimeouts().catch(console.error)

    bot.on(Events.GuildMemberRemove, async (member) => {
        await Promise.all(Object.values(TicketManager.managers).map((m) => m.onMemberRemove(member)))
    })
})

export class TicketManager {
    static ticketManagers: Record<string, TicketManager> = {}
    static get managers() {
        return Object.values(this.ticketManagers)
    }

    static getManager(ticketType: string) {
        return this.ticketManagers[ticketType]
    }

    static async findTicket(interaction: CommandHandlerInteraction) {
        const ticket = await Ticket.findOne({ channelId: interaction.channelId })
        if (!ticket) throw new LocalizedError("tickets.none")
        const ticketManager = TicketManager.getManager(ticket.type)
        if (!ticketManager)
            throw new UserError(
                "I am not responsible for these types of tickets. Maybe try a different integration.",
            )
        return { ticket, ticketManager }
    }

    protected readonly bot!: ScrimsBot
    readonly transcriber?: TicketTranscriber

    ticketChannels = new Set<string>()
    protected channelTicketsMap: Record<string, string | null> = {}
    readonly closeTimeouts = new Set<TicketCloseTimeout>()
    readonly pendingDeletion = new Set<string>()
    readonly guildConfig

    constructor(readonly type: string, readonly options: TicketManagerConfig = {}) {
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

        TicketManager.ticketManagers[type] = this
    }

    ticketShouldExist(ticket: Ticket) {
        return (
            !this.bot.guilds.cache.get(ticket.guildId)?.members?.me ||
            this.bot.channels.cache.get(ticket.channelId)
        )
    }

    async deleteGhostTickets(existingTickets: Ticket[]) {
        existingTickets = existingTickets.filter((v) => v.type === this.type)
        this.ticketChannels = new Set(existingTickets.map((v) => v.channelId))
        this.channelTicketsMap = Object.fromEntries(existingTickets.map((v) => [v.channelId, v.id!]))

        for (const ticket of existingTickets) {
            if (!this.ticketShouldExist(ticket)) {
                await this.closeTicket(ticket, null, CLOSE_REASONS.ChannelMissing).catch(console.error)
            }
        }
    }

    __addListeners() {
        this.bot.on(Events.GuildMemberRemove, (member) => this.onMemberRemove(member))
        this.bot.auditedEvents.on(AuditLogEvent.ChannelDelete, (channel) => this.onChannelDelete(channel))
    }

    async cancelCloseTimeouts(ticket: Ticket) {
        await Promise.all(
            Array.from(this.closeTimeouts)
                .filter((v) => v.ticketId === ticket.id)
                .map((v) => {
                    clearTimeout(v.timeout)
                    this.closeTimeouts.delete(v)
                    return redis.sRem("ticketCloseTimeouts", JSON.stringify({ ...v, timeout: undefined }))
                }),
        )
    }

    async addCloseTimeout(ticket: Ticket, message: Message, closer: User, seconds: number, reason?: string) {
        const timeout: TicketCloseTimeout = {
            ticketId: ticket.id!,
            channelId: message.channelId,
            messageId: message.id,
            timestamp: DateTime.now().toSeconds() + seconds,
            closerId: closer.id,
            reason,
            timeout: setTimeout(
                () => this.closeTicket(ticket, closer, reason).catch(console.error),
                seconds * 1000,
            ),
        }

        await redis.sAdd("ticketCloseTimeouts", JSON.stringify({ ...timeout, timeout: undefined }))
        this.closeTimeouts.add(timeout)
    }

    getTicketCategory(guildId: string) {
        const id = this.bot.getConfigValue(this.guildConfig.Category, guildId)
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

    async channelTicketId(channelId: string) {
        const cached = this.channelTicketsMap[channelId]
        if (cached !== undefined) return cached

        const ticket = await Ticket.findOne({ channelId, type: this.type })
        this.channelTicketsMap[channelId] = ticket?._id.toString() ?? null
        return ticket?._id.toString() ?? null
    }

    async verifyTicketRequest(user: User, guildId: string) {
        if (this.options.blackListed) {
            const blacklisted = this.bot.permissions.hasPosition(user, this.options.blackListed, guildId)
            if (blacklisted)
                throw new LocalizedError(
                    "tickets.blacklisted",
                    await blacklisted.expiration().then((v) => v && time(v, "R")),
                )
        }

        const existing = await Ticket.find({ guildId, userId: user.id, type: this.type, status: "open" })
        existing
            .filter((ticket) => !this.ticketShouldExist(ticket))
            .forEach((ticket) =>
                this.closeTicket(ticket, null, CLOSE_REASONS.ChannelMissing).catch(console.error),
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

        if (executor) await this.closeTicket(ticket, executor, CLOSE_REASONS.ChannelDeletedAudited)
        else await this.closeTicket(ticket, null, CLOSE_REASONS.ChannelDeletedUnaudited)
    }

    async closeTicket(ticket: Ticket, ticketCloser: User | null, reason?: string) {
        const guild = this.bot.guilds.cache.get(ticket.guildId)
        const channel = this.bot.channels.cache.get(ticket.channelId)

        const transcribeAndClose = async () => {
            const previousStatus = ticket.status
            try {
                ticket.status = "deleted"
                ticket.closerId = ticketCloser?.id
                ticket.closeReason = reason
                ticket.deletedAt = new Date()
                await ticket.save()

                if (this.transcriber && guild) await this.transcriber.send(guild, ticket)
            } catch (error) {
                ticket.status = previousStatus
                ticket.closerId = undefined
                ticket.closeReason = undefined
                ticket.deletedAt = undefined
                await ticket.save().catch(() => null)

                throw error
            }
        }

        if (!this.pendingDeletion.has(ticket.id!)) {
            this.pendingDeletion.add(ticket.id!)
            try {
                await this.cancelCloseTimeouts(ticket)
                if (ticket.status !== "deleted") await transcribeAndClose()
                if (channel) await channel.delete().catch(() => null)
            } finally {
                this.pendingDeletion.delete(ticket.id!)
            }
        }
    }

    async onMemberRemove(member: GuildMember | PartialGuildMember) {
        if (this.options.closeIfLeave === false) return

        const tickets = await Ticket.find({ userId: member.id, type: this.type })
        await Promise.allSettled(
            tickets.map((ticket) =>
                this.closeTicket(ticket, null, CLOSE_REASONS.CreatorLeft).catch((err) =>
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
    await Promise.all(Object.values(TicketManager.managers).map((m) => m.deleteGhostTickets(tickets)))
}

async function restoreCloseTimeouts() {
    const timeouts = await redis.sMembers("ticketCloseTimeouts")
    const parsed = timeouts.map((v) => JSON.parse(v) as TicketCloseTimeout)

    const tickets = await Ticket.findAndMap({ _id: { $in: parsed.map((p) => p.ticketId) } })
    await Promise.all(
        Object.values(parsed).map(async (v) => {
            const ticket = tickets[v.ticketId]
            if (!ticket) return

            const manager = TicketManager.getManager(ticket.type)
            if (!manager?.ticketChannels.has(v.channelId)) return

            const channel = ScrimsBot.INSTANCE?.channels.cache.get(v.channelId) as TextChannel
            if (await channel?.messages.fetch(v.messageId).catch(() => null)) {
                v.timeout = setTimeout(
                    () =>
                        manager
                            .closeTicket(
                                ticket,
                                ScrimsBot.INSTANCE?.users.cache.get(v.closerId) ?? null,
                                v.reason,
                            )
                            .catch(console.error),
                    Math.max(v.timestamp - DateTime.now().toSeconds(), 0) * 1000,
                )
                manager.closeTimeouts.add(v)
            }
        }),
    )
}
