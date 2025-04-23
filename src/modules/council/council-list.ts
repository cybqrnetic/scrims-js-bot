import { Collection, EmbedBuilder, Guild, GuildMember, bold } from "discord.js"
import { BotModule, MessageOptionsBuilder, UserProfile } from "lib"

import { RANKS } from "@Constants"
import { Config } from "@module/config"
import { BotMessage } from "@module/messages"
import { OnlinePositions, PositionRole } from "@module/positions"

for (const rank of Object.values(RANKS)) {
    BotMessage({
        name: `${rank} Council List`,
        permission: `council.${rank.toLowerCase()}.messages`,
        async builder(_builder, member) {
            return CouncilListFeature.getInstance().buildMessage(member.guild!, rank)
        },
    })

    Config.declareType(`${rank} Council List Message`)
}

Config.declareType(`Do Not DM Role`)

export class CouncilListFeature extends BotModule {
    protected async onReady() {
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
                if (message.embeds?.[0]?.description !== (updated.embeds[0] as any).description)
                    await message
                        .edit(updated)
                        .catch((err) => console.error(`Council List Update Failed: ${err}`))
            }
        }
    }

    async buildMessage(guild: Guild, role: string) {
        const embed = new EmbedBuilder().setTitle(`${role} Council List`)

        const councilHead = OnlinePositions.getMembersWithPosition(`${role} Head`)
        const council = OnlinePositions.getMembersWithPosition(`${role} Council`).subtract(councilHead)

        const councilRole = PositionRole.getRoles(`${role} Council`, guild.id)[0]
        if (councilRole) embed.setColor(councilRole.color)

        const getOffset = (member: GuildMember) => UserProfile.cache.get(member.id)?.offset ?? Infinity
        const sortMembers = (members: Collection<string, GuildMember>) => {
            return members.sort((a, b) => getOffset(a) - getOffset(b))
        }

        const content = await Promise.all(
            sortMembers(councilHead)
                .map((m) => this.buildCouncilInfo(m).then((v) => bold(v) as string))
                .concat(sortMembers(council).map((m) => this.buildCouncilInfo(m))),
        )

        embed.setDescription(content.join("\n") || "None")
        if (content.length) embed.setFooter({ text: "Council IGN | Discord | DM Status | Local Time +/- 10 mins" })

        return new MessageOptionsBuilder().addEmbeds(embed)
    }

    async buildCouncilInfo(member: GuildMember) {
        const profile = UserProfile.cache.get(member.id)
        const currentTime = profile?.getCurrentTime()
        const doNotDmRole = Config.getConfigValue("Do Not DM Role", member.guild.id)
        return (
            `\`•\` ` +
            [
                await profile?.fetchMCUsername(),
                member.toString(),
                doNotDmRole && member.roles.cache.has(doNotDmRole) ? "🔴" : "🟢",
                currentTime &&
                    currentTime.set({ minute: Math.round(currentTime.minute / 10) * 10 }).toFormat("h:mm a") +
                        ` (GMT${profile?.getUTCOffset()})`,
            ]
                .filter((v) => v)
                .join(" | ")
        )
    }
}

export default CouncilListFeature.getInstance()
