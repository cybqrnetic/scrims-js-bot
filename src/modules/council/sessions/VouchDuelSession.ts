import { RANKS, ROLE_APP_HUB } from "@Constants"
import {
    bold,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    Message,
    quote,
    subtext,
    userMention,
} from "discord.js"
import { Config, MessageOptionsBuilder, ScrimsBot, TimeUtil, UserProfile, Vouch } from "lib"

interface SessionCouncil {
    id: string
    vouches: Vouch[]
    joinedAt: Date
    sessionTime?: number
}

export class VouchDuelSession {
    static readonly buttonIds = {
        join: "JOIN_SESSION",
        leave: "LEAVE_SESSION",
    }

    private static readonly channels = Config.declareTypes(
        Object.fromEntries(Object.values(RANKS).map((rank) => [rank, `${rank} Session Channel`])),
    )
    private static readonly inactivityThreshold = 1000 * 60 * 30

    private static readonly activeSessions = new Map<string, VouchDuelSession>()

    private readonly activeCouncils = new Map<string, SessionCouncil>()
    private readonly inactiveCouncils: SessionCouncil[] = []

    private readonly startedAt = new Date()
    private endedAt?: Date

    private message?: Message

    constructor(
        councilId: string,
        readonly rank: string,
    ) {
        VouchDuelSession.findSession(councilId, this.rank)?.removeCouncil(councilId)
        this.activeCouncils.set(councilId, {
            id: councilId,
            vouches: [],
            joinedAt: this.startedAt,
        })

        VouchDuelSession.activeSessions.set(this.startedAt.getTime().toString(), this)

        this.sendMessage().catch(() => null)
        this.scheduleActivityCheck().catch(() => null)
    }

    static findSession(startedAt: string): VouchDuelSession | undefined
    static findSession(councilId: string, rank: string): VouchDuelSession | undefined
    static findSession(param1: string, param2?: string): VouchDuelSession | undefined {
        if (param2)
            return [...this.activeSessions.values()].find(
                (session) => session.activeCouncils.has(param1) && session.rank === param2,
            )

        return this.activeSessions.get(param1)
    }

    static async addVouch(vouch: Vouch) {
        const session = this.findSession(vouch.executorId, vouch.position)
        if (!session) return

        const council = session.activeCouncils.get(vouch.executorId)
        if (!council) return

        council.vouches.push(vouch)
        await session.updateMessage()
    }

    async addCouncil(councilId: string) {
        await VouchDuelSession.findSession(councilId, this.rank)?.removeCouncil(councilId)

        this.activeCouncils.set(councilId, {
            id: councilId,
            vouches: [],
            joinedAt: new Date(),
        })

        await this.updateMessage()
    }

    async removeCouncil(councilId: string, timeDeduction = 0, updateMesssage = true) {
        const council = this.activeCouncils.get(councilId)
        if (!council) return this

        const alreadyInactiveIndex = this.inactiveCouncils.findIndex((c) => c.id === councilId)

        const previousSessionTime = this.inactiveCouncils[alreadyInactiveIndex]?.sessionTime ?? 0
        const currentSessionTime = Math.max(
            0,
            new Date().getTime() - council.joinedAt.getTime() - timeDeduction,
        )
        council.sessionTime = previousSessionTime + currentSessionTime

        if (alreadyInactiveIndex === -1) this.inactiveCouncils.push(council)
        else this.inactiveCouncils[alreadyInactiveIndex] = council
        this.activeCouncils.delete(councilId)

        if (this.activeCouncils.size === 0) await this.endSession()
        else if (updateMesssage) await this.updateMessage()
    }

    private async sendMessage() {
        const channelId = Config.getConfigValue(VouchDuelSession.channels[this.rank], ROLE_APP_HUB)
        if (!channelId) return

        const channel = await ScrimsBot.INSTANCE?.channels.fetch(channelId).catch(() => null)
        if (!channel?.isSendable()) return

        const message = await channel
            .send(this.buildMessage([...this.activeCouncils.values()]))
            .catch(() => undefined)
        this.message = message
    }

    private async updateMessage() {
        if (!this.message || !this.activeCouncils.size) return

        const message = await this.message
            .edit(this.buildMessage([...this.activeCouncils.values()], this.inactiveCouncils))
            .catch(() => null)

        if (message) this.message = message
    }

    private async scheduleActivityCheck() {
        while (!this.endedAt) {
            await sleep(VouchDuelSession.inactivityThreshold)
            const now = new Date().getTime()

            const inactiveCouncils = [...this.activeCouncils.values()].filter((council) =>
                council.vouches.every(
                    (vouch) => vouch.givenAt.getTime() <= now - VouchDuelSession.inactivityThreshold,
                ),
            )

            for (const { id } of inactiveCouncils) {
                await this.removeCouncil(id, VouchDuelSession.inactivityThreshold, false).catch(() => null)
            }

            if (inactiveCouncils.length > 0 && this.activeCouncils.size > 0)
                await this.updateMessage().catch(() => null)
        }
    }

    private async endSession() {
        this.endedAt = new Date()
        VouchDuelSession.activeSessions.delete(this.startedAt.getTime().toString())

        if (this.message) await this.message.edit(this.buildMessage(this.inactiveCouncils)).catch(() => null)

        await Promise.all(
            this.inactiveCouncils.map((council) =>
                UserProfile.updateOne(
                    { _id: council.id },
                    { $inc: { councilSessionTime: council.sessionTime ?? 0 } },
                ).catch(() => null),
            ),
        )
    }

    private buildMessage(primaryCouncil: SessionCouncil[], secondaryCouncils?: SessionCouncil[]) {
        const now = new Date().getTime()
        const messageBuilder = new MessageOptionsBuilder()

        if (!this.endedAt) {
            messageBuilder.addButtons(
                new ButtonBuilder()
                    .setLabel("Join Session")
                    .setStyle(ButtonStyle.Primary)
                    .setCustomId(`${VouchDuelSession.buttonIds.join}/${this.startedAt.getTime()}`),
                new ButtonBuilder()
                    .setLabel("Leave Session")
                    .setStyle(ButtonStyle.Danger)
                    .setCustomId(`${VouchDuelSession.buttonIds.leave}/${this.startedAt.getTime()}`),
            )
        }

        const createCouncilField = (council: SessionCouncil) => {
            const positiveVouches = council.vouches.filter((v) => v.worth === 1).length
            const negativeVouches = council.vouches.filter((v) => v.worth === -1).length
            const sessionTimeString = TimeUtil.stringifyTimeDelta(
                council.sessionTime || now - council.joinedAt.getTime(),
            )

            return quote(
                userMention(council.id) +
                    bold(" | ") +
                    `✅ ${positiveVouches}` +
                    bold(" | ") +
                    `⛔ ${negativeVouches}` +
                    bold(" | ") +
                    `⏳ ${sessionTimeString}`,
            )
        }

        const legend = "\n\n" + subtext("Discord | Vouches | Devouches | Session Time")

        const primaryEmbed = new EmbedBuilder()
            .setTitle(`${this.rank} Vouch Duel Session`)
            .setColor(this.endedAt ? null : "Green")
            .setDescription(primaryCouncil.map(createCouncilField).join("\n\n") + legend)
            .setFooter({ text: `${this.endedAt ? "Ended at" : "Active Councils"}` })
            .setTimestamp(this.endedAt || null)

        messageBuilder.addEmbeds(primaryEmbed)

        if (secondaryCouncils?.length) {
            const secondaryEmbed = new EmbedBuilder()
                .setColor("Red")
                .setDescription(secondaryCouncils.map(createCouncilField).join("\n\n") + legend)
                .setFooter({ text: "Inactive Councils" })

            messageBuilder.addEmbeds(secondaryEmbed)
        }

        return messageBuilder
    }
}
