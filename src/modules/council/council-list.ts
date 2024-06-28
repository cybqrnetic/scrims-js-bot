import { Collection, EmbedBuilder, Guild, GuildMember, bold } from "discord.js"
import {
    BotMessage,
    BotModule,
    Config,
    MessageOptionsBuilder,
    PositionRole,
    ScrimsBot,
    UserProfile,
} from "lib"

import { Positions, RANKS } from "@Constants"

for (const rank of Object.values(RANKS)) {
    BotMessage({
        name: `${rank} Council List`,
        permissions: { positionLevel: Positions.Staff },
        async builder(builder, member) {
            return CouncilListFeature.getInstance().buildMessage(member.guild!, rank)
        },
    })

    Config.declareType(`${rank} Council List Message`)
}

export class CouncilListFeature extends BotModule {
    protected async onReady() {
        // Run every :00, :20, :40
        const closest = [20, 40, 60].map((n) => n - new Date().getUTCMinutes()).filter((v) => v > 0)
        setTimeout(
            () => setInterval(() => this.update().catch(console.error), 20 * 60 * 1000),
            Math.min(...closest) * 60 * 1000,
        )

        this.bot.on("initialized", () => this.update().catch(console.error))
    }

    async update() {
        for (const rank of Object.values(RANKS)) {
            const config = this.bot.getConfig(`${rank} Council List Message`)
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

        const permissions = ScrimsBot.INSTANCE!.permissions
        const councilHead = permissions.getMembersWithPosition(`${role} Head`)
        const council = permissions.getMembersWithPosition(`${role} Council`).subtract(councilHead)

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
        if (content.length) embed.setFooter({ text: "Council IGN | Discord | Local Time +/- 10 mins" })

        return new MessageOptionsBuilder().addEmbeds(embed)
    }

    async buildCouncilInfo(member: GuildMember) {
        const profile = UserProfile.cache.get(member.id)
        const currentTime = profile?.getCurrentTime()
        return (
            `\`•\` ` +
            [
                await profile?.fetchMCUsername(),
                member.toString(),
                currentTime &&
                    currentTime
                        .set({ minute: Math.floor(currentTime.minute / 10) * 10 })
                        .plus({ minutes: 10 })
                        .toFormat("h:mm a") + ` (GMT${profile?.getUTCOffset()})`,
            ]
                .filter((v) => v)
                .join(" | ")
        )
    }
}

export default CouncilListFeature.getInstance()
