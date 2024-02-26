import {
    EmbedBuilder,
    Events,
    Guild,
    GuildTextBasedChannel,
    Message,
    MessageReaction,
    PartialMessage,
    PartialMessageReaction,
    TextBasedChannel,
    bold,
    time,
} from "discord.js"

import { BotModule, Config, LikedClips } from "lib"
import { DateTime } from "luxon"
import MedalApi from "./MedalApi"

const GuildConfig = Config.declareTypes({
    ClipsChannel: "Clips Channel",
    CriticalVote: "Clips Critical Vote",
    LikedChannel: "Liked Clips Channel",
})

export class ClipsEvalFeature extends BotModule {
    addListeners() {
        this.bot.on(Events.MessageReactionRemove, (r) => this.onReactionUpdate(r))
        this.bot.on(Events.MessageReactionAdd, (r) => this.onReactionUpdate(r))

        this.bot.on(Events.MessageCreate, (msg) => this.filterLinks(msg))
        this.bot.on(Events.MessageUpdate, (_oldMsg, newMsg) => this.filterLinks(newMsg))
    }

    async onReady() {
        this.scheduleWeekDividerMessage()
    }

    async sendWeekDividerMessage(guild: Guild) {
        const likedChannelId = this.bot.getConfigValue(GuildConfig.LikedChannel, guild.id)
        if (!likedChannelId) return
        const likedChannel = await guild.channels.fetch(likedChannelId)
        if (likedChannel) await (likedChannel as TextBasedChannel).send(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    }

    scheduleWeekDividerMessage() {
        const msUntilSaturday = (6 - new Date().getDay() || 7) * 24 * 60 * 60 * 1000
        const nextSaturday = new Date(Date.now() + msUntilSaturday)
        nextSaturday.setHours(0, 0, 0, 0)
        setTimeout(() => {
            for (const guild of this.bot.guilds.cache.values())
                this.sendWeekDividerMessage(guild).catch(() => null)
            this.scheduleWeekDividerMessage()
        }, nextSaturday.getTime() - Date.now())
    }

    async filterLinks(message: Message | PartialMessage) {
        if (!message.inGuild() || message?.author?.bot) return
        const clipsChannelId = this.bot.getConfigValue(GuildConfig.ClipsChannel, message.guildId)
        if (message.channelId !== clipsChannelId) return

        if (/youtube|youtu\.be/i.test(message.content)) {
            await message
                .delete()
                .then(() =>
                    // Send explanation as long as message is from after this rule was implemented (2023-05-18)
                    message.createdTimestamp > 1684387500000
                        ? message.author.send(
                              `:warning:  **Your message from ${message.channel} was deleted since a possible Youtube link was detected!**` +
                                  `\n The channel is NOT meant for you to promote your channel or share other people's videos, ` +
                                  `rather to share cool clips you get throughout playing ` +
                                  `and to have a chance for your clip to be included in our 'Clips of the Week' series.`,
                          )
                        : null,
                )
                .catch(() => null)
        }
    }

    normalizeToLastSaturday(date: DateTime) {
        // while is not Saturday
        while (date.weekday !== 6) {
            date = date.minus({ days: 1 })
        }
        return date.toISODate()
    }

    async onReactionUpdate({ message }: MessageReaction | PartialMessageReaction) {
        if (!message.inGuild()) return
        const clipsChannel = this.bot.getConfigValue(GuildConfig.ClipsChannel, message.guildId)
        const criticalVote = this.bot.getConfigValue(GuildConfig.CriticalVote, message.guildId)
        if (message.channelId !== clipsChannel) return
        if (!criticalVote) return

        const now = DateTime.now()
        const createdAt = DateTime.fromJSDate(message.createdAt)
        if (this.normalizeToLastSaturday(now) !== this.normalizeToLastSaturday(createdAt)) return

        const upVotes = message.reactions.cache.get("👍")?.count ?? 0
        if (upVotes >= parseInt(criticalVote)) await this.markLikedClip(message)
    }

    wasMarked(message: PartialMessage | Message) {
        if (!LikedClips.cache.initialized.get()) return true
        return LikedClips.cache.has(message.id)
    }

    async markLikedClip(message: Message<true>) {
        if (this.wasMarked(message)) return

        const likedChannelId = this.bot.getConfigValue(GuildConfig.LikedChannel, message.guildId)
        if (!likedChannelId) return

        const likedChannel = await message.guild.channels.fetch(likedChannelId)
        if (!likedChannel || !likedChannel.isTextBased()) return

        const content = [bold(`From ${message.author} ${time(message.createdAt, "d")}:`), "\n"]
        if (message.attachments.size > 0) content.push(message.attachments.first()!.url)
        else content.push(message.content ?? "")

        await likedChannel.send({ content: content.join(""), allowedMentions: { parse: [] } }).then((sent) =>
            LikedClips.create({ _id: message.id })
                .then(() => this.sendMedalVideoLink(message, sent.channel).catch(console.error))
                .catch((err) =>
                    sent
                        .delete()
                        .catch(() => null)
                        .finally(() => console.error(err)),
                ),
        )
    }

    async sendMedalVideoLink(message: PartialMessage | Message, likedChannel: GuildTextBasedChannel) {
        const medalUrlRegex = /https:\/\/medal\.tv[\w-./?=%#&~]*\b/g
        const medalUrl = message.content?.match(medalUrlRegex)?.[0]
        if (medalUrl) {
            const medalApi = new MedalApi()
            await medalApi.guestAuthenticate()
            const clipId = await medalApi.loadClipIdFromUrl(medalUrl)
            if (clipId === undefined) return

            const clip = await medalApi.getContent(clipId)
            await likedChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor("Green")
                        .setTitle(`${clip.contentTitle ?? "Untitled"} - Medal Clip`)
                        .setDescription(
                            `Found a Medal Clip URL! [Click here](${clip.contentUrlBestQuality}) to download the video directly.`,
                        ),
                ],
            })
        }
    }
}

export default ClipsEvalFeature.getInstance()
