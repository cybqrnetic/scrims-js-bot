import { Config } from "@module/config"
import { OnlinePositions, PositionRole } from "@module/positions"
import {
    AuditLogEvent,
    BaseInteraction,
    CategoryChannel,
    Channel,
    channelMention,
    ChannelType,
    Collection,
    Events,
    GuildChannelCreateOptions,
    GuildMember,
    OverwriteData,
    OverwriteType,
    PartialGuildMember,
    PermissionFlagsBits,
    PermissionResolvable,
    User,
    type GuildTextBasedChannel,
} from "discord.js"

import { AuditedChannelAction, auditedEvents, bot, BotListener, DB, LocalizedError, UserError } from "lib"
import { Types } from "mongoose"
import { CloseTimeout, Ticket } from "./Ticket"
import TicketTranscriber, { TicketTranscriberOptions } from "./TicketTranscriber"

const CLOSE_REASONS = {
    CreatorLeft: "closed this ticket because of the person leaving the server",
    ChannelMissing: "closed this ticket because of the channel no longer existing",
    ChannelDeletedAudited: "deleted the ticket channel",
    ChannelDeletedUnaudited: "closed this ticket after someone deleted the channel",
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

const deletedTickets = DB.addStartupTask(() => Ticket.find({ status: { $ne: "deleted" } }))
BotListener("ready", () => {
    const tickets = deletedTickets.value.toMultiMap((v) => v.type)
    for (const manager of Object.values(TicketManager.managers)) {
        manager.initialize(tickets[manager.type] ?? [])
    }
})

export class TicketManager {
    private static ticketManagers: Record<string, TicketManager> = {}
    static async findTicket<Extras extends object>(interaction: BaseInteraction, perms = true) {
        const ticket = await Ticket.findOne({ channelId: interaction.channelId! })
        if (!ticket) throw new LocalizedError("tickets.none")
        if (ticket.status === "deleted") {
            throw new UserError("This ticket has been deleted.")
        }

        const manager = TicketManager.getManager(ticket.type)
        if (!manager) {
            throw new UserError(
                "I am not responsible for these types of tickets. Maybe try a different integration.",
            )
        }

        if (
            perms &&
            (manager.options.permission
                ? !interaction.user.hasPermission(manager.options.permission)
                : !interaction.memberPermissions?.has("Administrator"))
        ) {
            throw new LocalizedError("tickets.unauthorized_manage", ticket.type)
        }

        return { ticket: ticket as Ticket<Extras>, manager }
    }

    static get managers() {
        return Object.values(this.ticketManagers)
    }

    static getManager(type: string) {
        return this.ticketManagers[type]
    }

    private readonly transcriber?: TicketTranscriber
    private readonly guildConfig

    private readonly timeoutTimers = new Map<TicketCloseTimeout, NodeJS.Timeout>()
    private readonly timeouts = new Map<string, Set<TicketCloseTimeout>>()
    private readonly channels = new Set<string>()

    constructor(
        readonly type: string,
        readonly options: TicketManagerConfig = {},
    ) {
        TicketManager.ticketManagers[type] = this

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

        bot.on(Events.GuildMemberRemove, (member) => this.onMemberRemove(member))
        bot.on(Events.MessageDelete, (msg) => this.cancelCloseTimeouts(msg.id))
        auditedEvents.on(AuditLogEvent.ChannelDelete, (channel) => this.onChannelDelete(channel))
    }

    private ticketShouldExist(ticket: Ticket) {
        return !bot.guilds.cache.has(ticket.guildId) || bot.channels.cache.get(ticket.channelId)
    }

    initialize(tickets: Ticket[]) {
        for (const ticket of tickets) {
            if (!this.ticketShouldExist(ticket)) {
                this.closeTicket(ticket._id, undefined, CLOSE_REASONS.ChannelMissing).catch(console.error)
                continue
            }

            this.channels.add(ticket.channelId)
            if (ticket.closeTimeouts) {
                for (const timeout of ticket.closeTimeouts) {
                    this.startCloseTimeout({ ...timeout, ticketId: ticket._id.toString() })
                }
            }
        }
    }

    cancelCloseTimeouts(resolvable: string) {
        const timeouts = this.timeouts.get(resolvable)
        if (timeouts) {
            for (const timeout of timeouts) {
                this.removeCloseTimeoutIndex(timeout.ticketId, timeout)
                this.removeCloseTimeoutIndex(timeout.ticketId, timeout)

                clearTimeout(this.timeoutTimers.get(timeout))
                this.timeoutTimers.delete(timeout)
            }
        }
    }

    addCloseTimeout(timeout: CloseTimeout, ticket: Ticket) {
        this.startCloseTimeout({ ...timeout, ticketId: ticket._id.toString() })
        Ticket.updateOne(
            { _id: ticket._id, status: { $ne: "deleted" } },
            { $push: { closeTimeouts: timeout } },
        ).catch(console.error)
    }

    private startCloseTimeout(timeout: TicketCloseTimeout) {
        const time = Math.max(0, timeout.timestamp.getTime() - Date.now())

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

    private addCloseTimeoutIndex(key: string, timeout: TicketCloseTimeout) {
        if (!this.timeouts.get(key)?.add(timeout)) {
            this.timeouts.set(key, new Set([timeout]))
        }
    }

    private removeCloseTimeoutIndex(key: string, timeout: TicketCloseTimeout) {
        const timeouts = this.timeouts.get(key)
        if (timeouts && timeouts.delete(timeout) && timeouts.size === 0) {
            this.timeouts.delete(key)
        }
    }

    getTicketCategory(guildId: string) {
        const id = Config.getConfigValue(this.guildConfig.Category, guildId)
        return bot.channels.cache.get(id!) as CategoryChannel | undefined
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
                type: OverwriteType.Role,
                allow: parentOverwrites.get(member.guild.id)?.allow.remove(PermissionFlagsBits.ViewChannel),
                deny:
                    parentOverwrites.get(member.guild.id)?.deny.add(PermissionFlagsBits.ViewChannel) ??
                    PermissionFlagsBits.ViewChannel,
            },
            {
                id: member.id,
                type: OverwriteType.Member,
                allow: this.options.creatorPermissions,
                deny: parentOverwrites.get(member.id)?.deny,
            },
        )

        const channel = await member.guild.channels.create(channelOptions as GuildChannelCreateOptions)
        this.channels.add(channel.id)
        return channel
    }

    async verifyTicketRequest(user: User, guildId: string) {
        if (this.options.blackListed) {
            const blacklisted = OnlinePositions.hasPosition(user, this.options.blackListed)
            if (blacklisted) throw new LocalizedError("tickets.blacklisted")
        }

        const existing = await Ticket.find({ guildId, userId: user.id, type: this.type, status: "open" })
        for (const ticket of existing.filter((ticket) => !this.ticketShouldExist(ticket)))
            this.closeTicket(ticket._id, undefined, CLOSE_REASONS.ChannelMissing).catch(console.error)

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
            (Date.now() - pvTicket.createdAt.valueOf()) / 1000 < this.options.cooldown
        ) {
            throw new LocalizedError(
                "tickets.cooldown",
                Math.floor(pvTicket.createdAt.valueOf() / 1000 + this.options.cooldown),
            )
        }

        return true
    }

    async onChannelDelete({ channelId, executor, channel }: AuditedChannelAction) {
        if (!this.channels.has(channelId)) return

        const ticket = await Ticket.findOne({ channelId, type: this.type })
        if (!ticket) return

        if (executor)
            await this.closeTicket(ticket._id, executor.id, CLOSE_REASONS.ChannelDeletedAudited, channel)
        else await this.closeTicket(ticket._id, undefined, CLOSE_REASONS.ChannelDeletedUnaudited, channel)
    }

    async closeTicket(
        ticketId: Types.ObjectId | string,
        closerId?: string,
        reason?: string,
        channel?: Channel | null,
    ) {
        void this.cancelCloseTimeouts(ticketId.toString())

        const ticket = await Ticket.findOneAndUpdate(
            { _id: ticketId, status: { $ne: "deleted" } },
            {
                status: "deleted",
                closerId,
                closeReason: reason,
                deletedAt: new Date(),
                $unset: { closeTimeouts: "" },
            },
            { new: true },
        )

        if (ticket) {
            this.channels.delete(ticket.channelId)

            const guild = bot.guilds.cache.get(ticket.guildId)
            if (!channel) {
                channel = await bot.channels.fetch(ticket.channelId).catch(() => null)
            }

            if (this.transcriber && guild && channel?.isTextBased()) {
                await this.transcriber
                    .send(guild, ticket, channel as GuildTextBasedChannel)
                    .catch(console.error)
            }

            if (channel) {
                await channel.delete().catch(() => null)
            }
        }
    }

    async onMemberRemove(member: GuildMember | PartialGuildMember) {
        if (this.options.closeIfLeave === false) return

        const tickets = await Ticket.find({ userId: member.id, type: this.type })
        await Promise.allSettled(
            tickets.map((ticket) =>
                this.closeTicket(ticket._id, undefined, CLOSE_REASONS.CreatorLeft).catch((err) =>
                    console.error(`Error while automatically closing ticket ${ticket.id}!`, err),
                ),
            ),
        )
    }
}

interface TicketCloseTimeout extends CloseTimeout {
    ticketId: string
}
