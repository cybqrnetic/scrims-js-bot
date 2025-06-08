import { Events } from "discord.js"
import { BotListener } from "lib"

BotListener(Events.VoiceStateUpdate, async (_bot, oldState, newState) => {
    if (!newState.member?.user.bot && !oldState.member?.user.bot) return
    if (newState.channelId === oldState.channelId) return

    const newStateLimit = newState.channel?.userLimit
    const oldStateLimit = oldState.channel?.userLimit

    if (newStateLimit && newStateLimit < 99)
        await newState.channel.setUserLimit(newStateLimit + 1, "Bot joined voice channel")

    if (oldStateLimit && oldStateLimit > 1)
        await oldState.channel.setUserLimit(oldStateLimit - 1, "Bot left voice channel")
})
