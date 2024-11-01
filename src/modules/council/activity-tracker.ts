import { Positions, RANKS, ROLE_APP_HUB } from "@Constants"
import { bold, EmbedBuilder, GuildMember, quote, subtext, userMention } from "discord.js"
import {
    BotMessage,
    BotModule,
    Config,
    MessageOptionsBuilder,
    PositionRole,
    TimeUtil,
    UserProfile,
    Vouch,
} from "lib"
import { DateTime } from "luxon"

for (const rank of Object.values(RANKS)) {
    BotMessage({
        name: `${rank} Council Activity`,
        permissions: { positionLevel: Positions.Staff },
        builder: () => ActivityTracker.getInstance().buildMessage(rank),
    })
}

export class ActivityTracker extends BotModule {
    private static readonly weeklyIdeals = {
        vouches: Config.declareType("Ideal Weekly Vouches"),
        sessionTime: Config.declareType("Ideal Weekly Session Time"),
    }

    private static readonly channels = Config.declareTypes(
        Object.fromEntries(Object.values(RANKS).map((rank) => [rank, `${rank} Council Activity Channel`])),
    )

    async onReady() {
        await this.scheduleActivityLeaderboards()
    }

    async scheduleActivityLeaderboards(): Promise<void> {
        const now = DateTime.utc()
        const nextMonday = now.startOf("week").plus({ weeks: 1 })
        const nextEvenMonday = nextMonday.plus({ weeks: nextMonday.weekNumber % 2 })

        await sleep(nextEvenMonday.diff(now).toMillis())

        await Promise.all(
            Object.values(RANKS).map((rank) => this.sendActivityLeaderboard(rank).catch(() => null)),
        )

        await UserProfile.updateMany(
            { councilSessionTime: { $exists: true } },
            { $unset: { councilSessionTime: "" } },
        ).catch(() => null)

        return this.scheduleActivityLeaderboards()
    }

    async sendActivityLeaderboard(rank: string) {
        const channelId = this.bot.getConfigValue(ActivityTracker.channels[rank], ROLE_APP_HUB)
        if (!channelId) return

        const channel = await this.bot.channels.fetch(channelId).catch(() => null)
        if (!channel?.isSendable()) return

        await channel.send(await this.buildMessage(rank, true))
    }

    async buildMessage(rank: string, biWeeklyMessage = false) {
        const council = this.bot.permissions.getMembersWithPosition(`${rank} Council`)
        const councilIds = council.map((council) => council.id)
        const councilRole = PositionRole.getRoles(`${rank} Council`, ROLE_APP_HUB)[0]

        const now = DateTime.utc()
        const lastEvenMonday = biWeeklyMessage
            ? now.startOf("week").minus({ weeks: 2 })
            : now.startOf("week").minus({ weeks: now.weekNumber % 2 })

        const vouches = await Vouch.find({
            executorId: { $in: councilIds },
            position: rank,
            givenAt: { $gte: lastEvenMonday.toJSDate() },
        })

        const profiles = await UserProfile.find({
            _id: { $in: councilIds },
            councilSessionTime: { $exists: true },
        })

        const councilSessionTimes = Object.fromEntries(
            profiles.map((profile) => [profile._id, profile.councilSessionTime ?? 0]),
        )

        const idealMetrics = this.calculateIdealMetrics(now.diff(lastEvenMonday).as("days"))

        const councilActivity = await Promise.all(
            council.map((council) =>
                this.calculateCouncilActivity(
                    council,
                    vouches,
                    councilSessionTimes[council.id] ?? 0,
                    idealMetrics,
                ),
            ),
        )

        const embed = new EmbedBuilder()
            .setTitle(`${rank} Council Activity`)
            .setDescription(
                councilActivity
                    .sort((a, b) => b.activityScore - a.activityScore)
                    .map((council) =>
                        quote(
                            userMention(council.id) +
                                bold(" | ") +
                                `✅ ${council.positiveVouches}` +
                                bold(" | ") +
                                `⛔ ${council.negativeVouches}` +
                                bold(" | ") +
                                `⏳ ${TimeUtil.stringifyTimeDelta(council.sessionTime)}` +
                                bold(" | ") +
                                `📊 ${council.activityScore.toFixed(2)}`,
                        ),
                    )
                    .join("\n\n") +
                    "\n\n" +
                    subtext("Discord | Vouches | Devouches | Session Time | Activity Score"),
            )
            .setFooter({ text: "Meassured Since" })
            .setTimestamp(lastEvenMonday.toJSDate())
            .setColor(councilRole?.color ?? null)

        if (!council.size) embed.setDescription("None")

        return new MessageOptionsBuilder().addEmbeds(embed)
    }

    private calculateCouncilActivity(
        council: GuildMember,
        vouches: Vouch[],
        sessionTime: number,
        idealMetrics: { vouches: number; sessionTime: number },
    ) {
        const calculateCouncilVouches = (memberId: string, vouches: Vouch[], positive: boolean) =>
            vouches.filter((vouch) => vouch.executorId === memberId && vouch.isPositive() === positive).length

        const positiveVouches = calculateCouncilVouches(council.id, vouches, true)
        const negativeVouches = calculateCouncilVouches(council.id, vouches, false)

        const vouchRatio = Math.min(1, (positiveVouches + negativeVouches) / idealMetrics.vouches)
        const sessionTimeRatio = Math.min(1, sessionTime / idealMetrics.sessionTime)

        const activityScore = Math.min(1, (vouchRatio + sessionTimeRatio) / 2)

        return {
            id: council.id,
            positiveVouches,
            negativeVouches,
            sessionTime,
            activityScore,
        }
    }

    private calculateIdealMetrics(daysInPeriod: number) {
        const idealVouches = Config.getConfigValue(ActivityTracker.weeklyIdeals.vouches, ROLE_APP_HUB, "15")

        const idealSessionTime = Config.getConfigValue(
            ActivityTracker.weeklyIdeals.sessionTime,
            ROLE_APP_HUB,
            "3h",
        )

        const weeklyIdeals = {
            vouches: parseInt(idealVouches) || 15,
            sessionTime: TimeUtil.parseDuration(idealSessionTime) * 1000,
        }

        return {
            vouches: (daysInPeriod * weeklyIdeals.vouches) / 7,
            sessionTime: (daysInPeriod * weeklyIdeals.sessionTime) / 7,
        }
    }
}

export default ActivityTracker.getInstance()
