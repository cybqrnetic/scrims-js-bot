import { ChannelType, Events } from "discord.js"
import { BotListener, DB } from "lib"

BotListener(Events.MessageCreate, async (_bot, message) => {
    if (message.channel?.type === ChannelType.DM) {
        if (message.author?.id === "568427070020124672") {
            if (message.content === "!reload") {
                await DB.reloadCache()
                await message.reply({ content: "Cache reloaded." })
            } else if (message.content === "!stop") {
                console.log("Stop command used to terminate this process!")
                await message.reply({ content: "👋 **Goodbye**" })
                process.emit("SIGTERM")
            }
        }
    }
})
