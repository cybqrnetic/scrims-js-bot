import {
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    Message,
    bold,
    quote,
    subtext,
    userMention,
} from "discord.js"

import { RANKS, ROLE_APP_HUB } from "@Constants"
import { Config } from "@module/config"
import { Vouch } from "@module/vouch-system"
import { BotListener, DiscordBot, MessageOptionsBuilder, PersistentData, TimeUtil } from "lib"
import { CouncilSession } from "./CouncilSession"

interface SessionCouncil {
    id: string
    vouches: Set<string>
    devouches: Set<string>
    joinedAt: number
    sessionTime: number
    lastVouch?: number
}

interface SessionData {
    startedAt: number
    rank: string
    active?: [string, SessionCouncil][]
    inactive?: [string, SessionCouncil][]
    message?: string
}

function newCouncil(id: string, joinedAt = Date.now()): SessionCouncil {
    return {
        id,
        vouches: new Set(),
        devouches: new Set(),
        joinedAt,
        sessionTime: 0,
    }
}

const INACTIVITY_THRESHOLD = Config.declareType("Council Sessions Inactivity Threshold")
function getInactivityThreshold() {
    const config = Config.getConfigValue(INACTIVITY_THRESHOLD, ROLE_APP_HUB)
    if (config) {
        const parsed = TimeUtil.parseDuration(config)
        if (parsed) {
            return parsed * 1000
        }
    }
    return 30 * 60 * 1000
}

BotListener("initialized", () => VouchDuelSession.activeSessions.load())
Vouch.onUpdate((vouch) => VouchDuelSession.addVouch(vouch))

export class VouchDuelSession {
    static readonly BUTTONS = {
        Join: "JOIN_SESSION",
        Leave: "LEAVE_SESSION",
    }

    static readonly CHANNELS = Config.declareTypes(
        Object.fromEntries(Object.values(RANKS).map((rank) => [rank, `${rank} Council Sessions`])),
    )

    static readonly councilSessions = new Map<string, VouchDuelSession>()
    static readonly activeSessions = new PersistentData(
        "VouchDuelSessions",
        new Map<string, VouchDuelSession>(),
        (data) => Array.from(data.entries()).map(([k, v]): [string, SessionData] => [k, v.toJson()]),
        (from, data) => new Map(data.map(([k, v]) => [k, new VouchDuelSession(v)])),
    )

    static async findSession(startedAt: string) {
        const sessions = await this.activeSessions.get()
        return sessions.get(startedAt)
    }

    static async findCouncilSession(council: string) {
        await this.activeSessions.get()
        return this.councilSessions.get(council)
    }

    static async addVouch(vouch: Vouch) {
        const session = await this.findCouncilSession(vouch.executorId)
        if (session) await session.addVouch(vouch)
    }

    static async create(council: string, rank: string) {
        const sessions = await this.activeSessions.get()
        const data = { startedAt: Date.now(), rank }

        const session = new VouchDuelSession(data, [council])
        sessions.set(session.id, session)
        return session
    }

    public readonly startedAt: number
    public readonly id: string
    public readonly rank: string

    private readonly activeCouncils: Map<string, SessionCouncil>
    private readonly inactiveCouncils: Map<string, SessionCouncil>
    private readonly inactivityThreshold = getInactivityThreshold()
    private readonly activityCheck: NodeJS.Timeout

    private endedAt?: number
    private message?: Promise<Message | void>
    private messageId?: string

    protected constructor(data: SessionData, initialCouncil: string[] = []) {
        this.startedAt = data.startedAt
        this.id = this.startedAt.toString()
        this.rank = data.rank
        this.activeCouncils = new Map(data.active)
        this.inactiveCouncils = new Map(data.inactive)

        for (const council of initialCouncil) {
            this.addCouncilNow(council)
        }

        for (const council of Array.from(this.activeCouncils.keys())) {
            VouchDuelSession.councilSessions.set(council, this)
        }

        this.recoverMessage(data.message).catch(console.error)
        this.activityCheck = setInterval(() => this.checkActivity(), 60 * 1000)
        this.checkActivity()
    }

    private async recoverMessage(messageId: string | undefined) {
        const channel = await this.fetchChannel()
        if (!channel?.isSendable()) return

        if (messageId) {
            this.message = channel.messages.fetch(messageId).catch(() => {})
            this.message.then((v) => this.updateMessage().catch(console.error))
        } else {
            this.message = channel.send(this.buildMessage()).catch(console.error)
        }

        this.message.then((v) => (this.messageId = v?.id))
    }

    protected toJson(): SessionData {
        return {
            startedAt: this.startedAt,
            rank: this.rank,
            active: Array.from(this.activeCouncils.entries()),
            inactive: Array.from(this.inactiveCouncils.entries()),
            message: this.messageId,
        }
    }

    async addCouncil(councilId: string) {
        if (this.activeCouncils.has(councilId)) return

        this.addCouncilNow(councilId)
        await this.updateMessage()
    }

    private addCouncilNow(councilId: string) {
        VouchDuelSession.councilSessions.get(councilId)?.removeCouncil(councilId).catch(console.error)

        const previous = this.inactiveCouncils.get(councilId)
        this.inactiveCouncils.delete(councilId)

        if (previous) {
            previous.joinedAt = Date.now()
            this.activeCouncils.set(councilId, previous)
        } else {
            this.activeCouncils.set(councilId, newCouncil(councilId))
        }

        VouchDuelSession.councilSessions.set(councilId, this)
    }

    async removeCouncil(councilId: string) {
        const council = this.activeCouncils.get(councilId)
        if (!council) return

        this.removeCouncilNow(council)

        if (this.activeCouncils.size === 0) await this.endSession()
        else await this.updateMessage()
    }

    private removeCouncilNow(council: SessionCouncil) {
        if (council.lastVouch) {
            if (council.lastVouch > council.joinedAt)
                council.sessionTime += council.lastVouch - council.joinedAt
            this.inactiveCouncils.set(council.id, council)
        }

        this.activeCouncils.delete(council.id)
        VouchDuelSession.councilSessions.delete(council.id)
    }

    async addVouch(vouch: Vouch) {
        const council = this.activeCouncils.get(vouch.executorId)
        if (!council) return

        if (vouch.isPositive()) {
            council.devouches.delete(vouch.userId)
            council.vouches.add(vouch.userId)
        } else {
            council.vouches.delete(vouch.userId)
            council.devouches.add(vouch.userId)
        }

        council.lastVouch = Date.now()
        await this.updateMessage()
    }

    private async fetchChannel() {
        await Config.cache.initialized()
        const channelId = Config.getConfigValue(VouchDuelSession.CHANNELS[this.rank]!, ROLE_APP_HUB)
        if (!channelId) return

        return DiscordBot.getInstance()
            .channels.fetch(channelId)
            .catch(() => undefined)
    }

    private async updateMessage() {
        const message = await this.message
        await message?.edit(this.buildMessage()).catch(console.error)
    }

    private checkActivity() {
        const now = Date.now()
        for (const council of this.activeCouncils.values()) {
            const afk = now - (council.lastVouch ?? council.joinedAt)
            if (afk >= this.inactivityThreshold) {
                this.removeCouncilNow(council)
            }
        }

        if (this.activeCouncils.size === 0) this.endSession().catch(console.error)
        else this.updateMessage().catch(console.error)
    }

    private async endSession() {
        this.endedAt = Date.now()
        clearInterval(this.activityCheck)
        VouchDuelSession.activeSessions.get().then((v) => v.delete(this.id))

        for (const council of this.activeCouncils.values()) {
            this.removeCouncilNow(council)
        }

        CouncilSession.insertMany(
            Array.from(this.inactiveCouncils.values())
                .filter((v) => v.sessionTime > 0)
                .map((v) => ({
                    council: v.id,
                    rank: this.rank,
                    date: this.startedAt,
                    time: v.sessionTime,
                    vouches: v.vouches.size,
                    devouches: v.devouches.size,
                })),
        ).catch(console.error)

        await this.updateMessage().catch(console.error)
    }

    private buildMessage() {
        const primaryCouncil = this.endedAt ? this.inactiveCouncils : this.activeCouncils
        const secondaryCouncils = this.endedAt ? undefined : this.inactiveCouncils

        const now = Date.now()
        const messageBuilder = new MessageOptionsBuilder()

        if (!this.endedAt) {
            messageBuilder.addButtons(
                new ButtonBuilder()
                    .setLabel("Join Session")
                    .setStyle(ButtonStyle.Primary)
                    .setCustomId(`${VouchDuelSession.BUTTONS.Join}/${this.id}`),
                new ButtonBuilder()
                    .setLabel("Leave Session")
                    .setStyle(ButtonStyle.Danger)
                    .setCustomId(`${VouchDuelSession.BUTTONS.Leave}/${this.id}`),
            )
        }

        const createCouncilField = (council: SessionCouncil) => {
            const time =
                (this.activeCouncils.has(council.id) ? now - council.joinedAt : 0) + council.sessionTime
            const sessionTimeString = TimeUtil.stringifyTimeDelta(time, 2, false, "just joined")

            const separator = bold(" | ")
            return quote(
                userMention(council.id) +
                    `${separator}✅ ${council.vouches.size}` +
                    `${separator}⛔ ${council.devouches.size}` +
                    `${separator}⏳ ${sessionTimeString}`,
            )
        }

        const legend = "\n\n" + subtext("Discord | Vouches | Devouches | Session Time")

        const primaryEmbed = new EmbedBuilder()
            .setTitle(`${this.rank} Vouch Duel Session`)
            .setColor(this.endedAt ? null : "Green")
            .setDescription(Array.from(primaryCouncil.values()).map(createCouncilField).join("\n\n") + legend)
            .setFooter({ text: `${this.endedAt ? "Ended at" : "Active Councils"}` })
            .setTimestamp(this.endedAt ?? null)

        messageBuilder.addEmbeds(primaryEmbed)

        if (secondaryCouncils?.size) {
            const secondaryEmbed = new EmbedBuilder()
                .setColor("Red")
                .setDescription(
                    Array.from(secondaryCouncils.values()).map(createCouncilField).join("\n\n") + legend,
                )
                .setFooter({ text: "Inactive Councils" })

            messageBuilder.addEmbeds(secondaryEmbed)
        }

        return messageBuilder
    }
}
