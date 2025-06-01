import { Collection, EmbedBuilder, Guild, GuildMember, bold } from "discord.js"
import { BotModule, MessageOptionsBuilder } from "lib"

import { RANKS } from "@Constants"
import { Config } from "@module/config"
import { BotMessage } from "@module/messages"
import { OnlinePositions, PositionRole } from "@module/positions"
import { UserProfile } from "@module/profiler"

for (const rank of Object.values(RANKS)) {
    BotMessage({
        name: `${rank} Council List`,
        permission: `council.${rank.toLowerCase()}.messages`,
        async builder(i18n, member) {
            return CouncilListFeature.getInstance().buildMessage(member.guild, rank)
        },
    })

    Config.declareType(`${rank} Council List Message`)
}

const DO_NOT_DM = PositionRole.declarePosition(`Do Not DM`)

export class CouncilListFeature extends BotModule {
    protected onReady() {
        // Run every :00, :10, :20, :30, :40, :50
        const date = new Date()
        const next = Math.ceil(date.getUTCMinutes() / 10) * 10
        setTimeout(
            () => {
                this.update().catch(console.error)
                setInterval(() => this.update().catch(console.error), 10 * 60 * 1000)
            },
            date.setUTCMinutes(next, 0, 0) - Date.now(),
        )

        this.bot.on("initialized", () => this.update().catch(console.error))
    }

    async update() {
        for (const rank of Object.values(RANKS)) {
            const config = Config.getConfig(`${rank} Council List Message`)
            if (!config.length) continue

            for (const entry of config) {
                const [channelId, messageId] = entry.value.split("-")
                if (!channelId || !messageId) return
                const channel = await this.bot.channels.fetch(channelId).catch(() => null)
                if (!channel?.isTextBased()) return
                const message = await channel.messages.fetch(messageId).catch(() => null)
                if (!message) return
                const updated = await this.buildMessage(message.guild!, rank)
                if (message.embeds?.[0]?.description !== updated.embeds[0]?.description)
                    await message
                        .edit(updated)
                        .catch((err) => console.error(`Council List Update Failed: ${err}`))
            }
        }
    }

    async buildMessage(guild: Guild, role: string) {
        const embed = new EmbedBuilder().setTitle(`${role} Council List`)

        const councilHead = OnlinePositions.getMembersWithPosition(`${role} Head`, guild.id)
        const council = OnlinePositions.getMembersWithPosition(`${role} Council`, guild.id).subtract(
            councilHead,
        )

        const councilIds = [...councilHead.keys(), ...council.keys()]
        const profiles = (await UserProfile.find({ _id: { $in: councilIds } })).toMap((v) => v._id)

        const councilRole = PositionRole.getRoles(`${role} Council`, guild.id)[0]
        if (councilRole) embed.setColor(councilRole.color)

        const getOffset = (member: GuildMember) => profiles[member.id]?.offset ?? Infinity
        const sortMembers = (members: Collection<string, GuildMember>) => {
            return members.sort((a, b) => getOffset(a) - getOffset(b))
        }

        const content = await Promise.all(
            sortMembers(councilHead)
                .map((m) => this.buildCouncilInfo(profiles, m).then((v) => bold(v) as string))
                .concat(sortMembers(council).map((m) => this.buildCouncilInfo(profiles, m))),
        )

        embed.setDescription(content.join("\n") || "None")
        if (content.length)
            embed.setFooter({ text: "Council IGN | Discord | DM Status | Local Time +/- 10 mins" })

        return new MessageOptionsBuilder().addEmbeds(embed)
    }

    async buildCouncilInfo(profiles: Record<string, UserProfile>, member: GuildMember) {
        const profile = profiles[member.id]
        const localTime = profile?.getCurrentTime()
        const stats = [
            await profile?.fetchMCUsername(),
            member.toString(),
            OnlinePositions.hasPosition(member, DO_NOT_DM, member.guild.id) ? "🔴" : "🟢",
            localTime &&
                localTime.set({ minute: Math.round(localTime.minute / 10) * 10 }).toFormat("h:mm a") +
                    ` (GMT${profile!.getUTCOffset()})`,
        ]

        return `- ${stats.filter((v) => v).join(" | ")}`
    }
}

export default CouncilListFeature.getInstance()
