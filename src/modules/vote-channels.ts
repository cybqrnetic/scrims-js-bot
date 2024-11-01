import { Emojis } from "@Constants"
import { Events } from "discord.js"
import { BotListener, Config } from "lib"

const VOTE_CHANNELS = Config.declareType("Vote Channels")
const channels: Map<string, Set<string>> = new Map()

Config.onCache("add", VOTE_CHANNELS, (doc) => channels.set(doc.guildId, new Set(doc.value.split(","))))
Config.onCache("delete", VOTE_CHANNELS, (doc) => channels.delete(doc.guildId))

BotListener(Events.MessageCreate, async (bot, message) => {
    if (!message.author.bot || !message.inGuild() || message.channel.isThread()) return
    if (!channels.get(message.guildId)?.has(message.channelId)) return

    await Promise.all([
        message.startThread({ name: "Discussion" }),
        message.react(Emojis.thumbsup),
        message.react(Emojis.thumbdown),
    ])
})
