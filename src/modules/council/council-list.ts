import { Collection, ContainerBuilder, Guild, GuildMember, MessageFlags, bold } from "discord.js"
import { BotModule, MessageOptionsBuilder, TimeUtil } from "lib"

import { RANKS } from "@Constants"
import { Config } from "@module/config"
import { BotMessage } from "@module/messages"
import { OnlinePositions, PositionRole } from "@module/positions"
import { UserProfile } from "@module/profiler"

for (const rank of Object.values(RANKS)) {
    const MESSAGE_CONFIG = Config.declareType(`${rank} Council List Message`)

    BotMessage({
        name: `${rank} Council List`,
        permission: `council.${rank.toLowerCase()}.messages`,
        async builder(i18n, member) {
            return CouncilListFeature.getInstance().buildMessage(member.guild, rank)
        },

        async postSend(message) {
            await Config.updateOne(
                { type: MESSAGE_CONFIG, guildId: message.guildId },
                { value: `${message.channelId}-${message.id}` },
                { upsert: true },
            )
        },
    })
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

        this.update().catch(console.error)
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
                if (!message || !message.flags.has(MessageFlags.IsComponentsV2)) return
                const updated = await this.buildMessage(message.guild!, rank)
                if (!updated.contentEquals(message)) {
                    await message
                        .edit(updated)
                        .catch((err) => console.error(`Council List Update Failed: ${err}`))
                }
            }
        }
    }

    async buildMessage(guild: Guild, role: string) {
        const container = new ContainerBuilder()

        const councilHead = OnlinePositions.getMembersWithPosition(`${role} Head`)
        const council = OnlinePositions.getMembersWithPosition(`${role} Council`).subtract(councilHead)

        const councilIds = [...councilHead.keys(), ...council.keys()]
        const profiles = (await UserProfile.find({ _id: { $in: councilIds } })).toMap((v) => v._id)

        const councilRole = PositionRole.getRoles(`${role} Council`, guild.id)[0]
        if (councilRole) container.setAccentColor(councilRole.color)

        const getOffset = (member: GuildMember) => profiles[member.id]?.offset ?? Infinity
        const sortMembers = (members: Collection<string, GuildMember>) => {
            return members.sort((a, b) => getOffset(a) - getOffset(b))
        }

        const content = await Promise.all(
            sortMembers(councilHead)
                .map((m) => this.buildCouncilInfo(profiles, m, true))
                .concat(sortMembers(council).map((m) => this.buildCouncilInfo(profiles, m))),
        )

        return new MessageOptionsBuilder().setContainer(
            container.addTextDisplayComponents((text) =>
                text.setContent(
                    `### ${role} Council List\n` +
                        (content.length
                            ? `${content.join("\n")}\n-# Council IGN | Discord | DM Status | Local Time +/- 10 mins`
                            : "Empty."),
                ),
            ),
        )
    }

    async buildCouncilInfo(profiles: Record<string, UserProfile>, member: GuildMember, head = false) {
        const profile = profiles[member.id]
        const localTime = profile?.getCurrentTime()
        const stats = [
            await profile?.fetchMCUsername(),
            member.toString(),
            OnlinePositions.hasPosition(member, DO_NOT_DM, member.guild.id) ? "🔴" : "🟢",
            localTime &&
                localTime.set({ minute: Math.round(localTime.minute / 10) * 10 }).toFormat("h:mm a") +
                    ` (GMT${TimeUtil.stringifyOffset(profile!.getOffset())})`,
        ]

        const content = stats.filter((v) => v).join(" | ")
        return `- ${head ? bold(content) : content}`
    }
}

export default CouncilListFeature.getInstance()
