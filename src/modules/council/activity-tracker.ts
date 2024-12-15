import { bold, EmbedBuilder, GuildMember, quote, subtext, userMention } from "discord.js"
import { BotModule, MessageOptionsBuilder, TimeUtil } from "lib"
import { DateTime } from "luxon"

import { RANKS, ROLE_APP_HUB } from "@Constants"
import { Config } from "@module/config"
import { BotMessage } from "@module/messages"
import { OnlinePositions, PositionRole } from "@module/positions"
import { Vouch } from "@module/vouch-system"
import { CouncilSession } from "./sessions/CouncilSession"

for (const rank of Object.values(RANKS)) {
    BotMessage({
        name: `${rank} Council Activity`,
        permission: `council.${rank}.messages`,
        builder: () => ActivityTracker.getInstance().buildMessage(rank),
    })
}

export class ActivityTracker extends BotModule {
    private static readonly WEEKLY_IDEALS = {
        Vouches: Config.declareType("Ideal Weekly Vouches"),
        SessionTime: Config.declareType("Ideal Weekly Session Time"),
    }

    private static readonly MESSAGES = Config.declareTypes(
        Object.fromEntries(Object.values(RANKS).map((rank) => [rank, `${rank} Council Activity Message`])),
    )

    private static readonly CHANNELS = Config.declareTypes(
        Object.fromEntries(Object.values(RANKS).map((rank) => [rank, `${rank} Council Activity Channel`])),
    )

    async onReady() {
        Vouch.onUpdate((vouch) => this.sendActivityLeaderboard(vouch.position))
        CouncilSession.watcher().on("insert", (session) => this.sendActivityLeaderboard(session.rank))
        Promise.all([Config.cache.initialized(), PositionRole.cache.initialized()]).then(() => {
            this.sendActivityLeaderboards()
            for (const rank of Object.values(RANKS)) {
                Config.onCache("add", ActivityTracker.CHANNELS[rank]!, (v) =>
                    this.sendActivityLeaderboard(rank).catch(console.error),
                )
            }
        })

        setInterval(() => this.sendActivityLeaderboards(), 60 * 60 * 1000)
    }

    private async sendActivityLeaderboards() {
        for (const rank of Object.values(RANKS)) {
            await this.sendActivityLeaderboard(rank).catch(console.error)
        }
    }

    private async sendActivityLeaderboard(rank: string) {
        const channelId = Config.getConfigValue(ActivityTracker.CHANNELS[rank]!, ROLE_APP_HUB)
        if (!channelId) return

        const channel = await this.bot.channels.fetch(channelId).catch(() => null)
        if (!channel?.isSendable()) return

        const message = await this.buildMessage(rank)

        const existingId = Config.getConfigValue(ActivityTracker.MESSAGES[rank]!, ROLE_APP_HUB)
        if (existingId) {
            const existing = await channel.messages.fetch(existingId).catch(() => null)
            if (
                existing &&
                existing.embeds[0]?.timestamp?.slice(0, 10) === message.embeds[0]?.timestamp?.slice(0, 10)
            ) {
                await existing.edit(message)
                return
            }
        }

        const sent = await channel.send(message)
        Config.updateOne(
            { type: ActivityTracker.MESSAGES[rank]!, guildId: ROLE_APP_HUB },
            { value: sent.id },
            { upsert: true },
        ).catch(console.error)
    }

    async buildMessage(rank: string) {
        const council = OnlinePositions.getMembersWithPosition(`${rank} Council`, ROLE_APP_HUB)
        const councilRole = PositionRole.getRoles(`${rank} Council`, ROLE_APP_HUB)[0]

        const cutoff = this.getBiweeklyStart()
        const [vouches, sessions] = await Promise.all([
            Vouch.find({
                position: rank,
                executorId: { $exists: true },
                givenAt: { $gt: cutoff.toJSDate() },
            }),
            CouncilSession.aggregate([
                {
                    $match: {
                        rank,
                        date: { $gt: cutoff.toJSDate() },
                    },
                },
                {
                    $group: {
                        _id: "$council",
                        time: { $sum: "$time" },
                    },
                },
            ]),
        ])

        const councilVouches = new Map<string, number>()
        const councilDevouches = new Map<string, number>()
        for (const vouch of vouches) {
            const map = vouch.isPositive() ? councilVouches : councilDevouches
            map.set(vouch.executorId, (map.get(vouch.executorId) ?? 0) + 1)
        }

        const councilTimes = new Map<string, number>()
        for (const session of sessions) {
            councilTimes.set(session._id.toString(), session.time)
        }

        const idealMetrics = this.calculateIdealMetrics(DateTime.now().diff(cutoff, "days").days)
        const councilActivity = council.map((council) =>
            this.calculateCouncilActivity(
                council,
                councilVouches.get(council.id) ?? 0,
                councilDevouches.get(council.id) ?? 0,
                councilTimes.get(council.id) ?? 0,
                idealMetrics,
            ),
        )

        return new MessageOptionsBuilder().addEmbeds(
            new EmbedBuilder()
                .setTitle(`${rank} Council Activity`)
                .setDescription(
                    council.size
                        ? councilActivity
                              .sort((a, b) => b.activityScore - a.activityScore)
                              .map((council) =>
                                  quote(
                                      [
                                          userMention(council.id),
                                          `✅ ${council.vouches}`,
                                          `⛔ ${council.devouches}`,
                                          `⏳ ${TimeUtil.stringifyTimeDelta(council.sessionTime)}`,
                                          `📊 ${council.activityScore.toFixed(2)}`,
                                      ].join(bold(" | ")),
                                  ),
                              )
                              .join("\n\n") +
                              "\n\n" +
                              subtext("Discord | Vouches | Devouches | Session Time | Activity Score")
                        : "None",
                )
                .setFooter({ text: "Measured Since" })
                .setTimestamp(cutoff.toJSDate())
                .setColor(councilRole?.color ?? null),
        )
    }

    private calculateCouncilActivity(
        council: GuildMember,
        vouches: number,
        devouches: number,
        sessionTime: number,
        idealMetrics: { vouches: number; sessionTime: number },
    ) {
        const vouchRatio = Math.min(1, (vouches + devouches) / idealMetrics.vouches)
        const sessionTimeRatio = Math.min(1, sessionTime / idealMetrics.sessionTime)
        const activityScore = Math.min(1, (vouchRatio + sessionTimeRatio) / 2)

        return {
            id: council.id,
            vouches,
            devouches,
            sessionTime,
            activityScore,
        }
    }

    private getBiweeklyStart() {
        const current = DateTime.now().startOf("week")
        const week = current.diff(DateTime.fromSeconds(0), "weeks").weeks
        return current.minus({ weeks: week % 2 })
    }

    private calculateIdealMetrics(daysInPeriod: number) {
        const idealVouches = Config.getConfigValue(ActivityTracker.WEEKLY_IDEALS.Vouches, ROLE_APP_HUB, "")
        const idealSessionTime = Config.getConfigValue(
            ActivityTracker.WEEKLY_IDEALS.SessionTime,
            ROLE_APP_HUB,
            "",
        )

        const weeklyIdeals = {
            vouches: parseInt(idealVouches) || 15,
            sessionTime: (TimeUtil.parseDuration(idealSessionTime) || 3 * 60 * 60) * 1000,
        }

        return {
            vouches: daysInPeriod * (weeklyIdeals.vouches / 7),
            sessionTime: daysInPeriod * (weeklyIdeals.sessionTime / 7),
        }
    }
}

export default ActivityTracker.getInstance()
