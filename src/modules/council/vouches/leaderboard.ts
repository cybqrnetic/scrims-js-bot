import { EmbedBuilder, Guild, inlineCode, userMention } from "discord.js"
import { BotModule, MessageOptionsBuilder } from "lib"

import { RANKS } from "@Constants"
import { Config } from "@module/config"
import { BotMessage } from "@module/messages"
import { OnlinePositions, PositionRole } from "@module/positions"
import { Vouch } from "@module/vouch-system"

for (const rank of Object.values(RANKS)) {
    BotMessage({
        name: `${rank} Council Leaderboard`,
        permission: `council.${rank.toLowerCase()}.messages`,
        async builder(_builder, member) {
            const vouches = await Vouch.find({ position: rank })
            return LeaderboardFeature.getInstance().buildMessage(member.guild!, vouches, rank)
        },
    })

    Config.declareType(`${rank} Council Leaderboard Message`)
}

export class LeaderboardFeature extends BotModule {
    protected async onReady() {
        setInterval(() => this.updateAll().catch(console.error), 60 * 60 * 1000)
        Config.cache.initialized().then(() => this.updateAll().catch(console.error))
        Vouch.onUpdate((vouch) => this.update(vouch.position).catch(console.error))
    }

    async updateAll() {
        for (const rank of Object.values(RANKS)) {
            await this.update(rank).catch(console.error)
        }
    }

    async update(rank: string) {
        const config = Config.getConfig(`${rank} Council Leaderboard Message`)
        if (!config.length) return

        const vouches = await Vouch.find({ position: rank })
        for (const entry of config) {
            const [channelId, messageId] = entry.value.split("-")
            if (!channelId || !messageId) return
            const channel = await this.bot.channels.fetch(channelId).catch(() => null)
            if (!channel?.isTextBased()) return
            const message = await channel.messages.fetch(messageId).catch(() => null)
            if (!message) return
            const updated = await this.buildMessage(message.guild!, vouches, rank)
            if (message.embeds?.[0]?.description !== (updated.embeds[0] as any).description)
                await message
                    .edit(updated)
                    .catch((err) => console.error(`Council Leaderboard Update Failed: ${err}`))
        }
    }

    async buildMessage(guild: Guild, vouches: Vouch[], role: string) {
        const embed = new EmbedBuilder().setTitle(`${role} Council Leaderboard`)

        const council = OnlinePositions.getMembersWithPosition(`${role} Council`)
        const councilRole = PositionRole.getRoles(`${role} Council`, guild.id)[0]
        if (councilRole) embed.setColor(councilRole.color)

        const councilVouches: Record<string, Vouch[]> = {}
        const councilVouchesPositive: Record<string, Vouch[]> = {}
        const councilVouchesNegative: Record<string, Vouch[]> = {}
        for (const vouch of vouches) {
            const key = vouch.executorId
            if (councilVouches[key]?.push(vouch) === undefined) {
                councilVouches[key] = [vouch]
            }

            if (vouch.isPositive()) {
                if (councilVouchesPositive[key]?.push(vouch) === undefined) {
                    councilVouchesPositive[key] = [vouch]
                }
            } else {
                if (councilVouchesNegative[key]?.push(vouch) === undefined) {
                    councilVouchesNegative[key] = [vouch]
                }
            }
        }

        const getLength = (id: string, map: Record<string, unknown[]>) => map[id]?.length ?? 0

        embed.setDescription(
            council
                .sort((a, b) => getLength(b.id, councilVouches) - getLength(a.id, councilVouches))
                .map((council) => {
                    return (
                        inlineCode("•") +
                        " " +
                        userMention(council.id) +
                        " | " +
                        `✅ ${getLength(council.id, councilVouchesPositive)}` +
                        " | " +
                        `⛔ ${getLength(council.id, councilVouchesNegative)}`
                    )
                })
                .join("\n") || "None",
        )

        if (council.size) embed.setFooter({ text: "Discord | Vouches | Devouches" })

        return new MessageOptionsBuilder().addEmbeds(embed)
    }
}

export default LeaderboardFeature.getInstance()
