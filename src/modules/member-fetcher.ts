import { Events } from "discord.js"
import { bot } from "lib"

const fetched = new Promise((resolve) =>
    bot.ready().then(async () => {
        const start = Date.now()
        await Promise.all(bot.guilds.cache.values().map((guild) => guild.members.fetch()))
            .then(() => console.log(`Fetched all guild members in ${Date.now() - start}ms`))
            .catch(console.error)
            .finally(() => resolve(null))
    }),
)

bot.on(Events.GuildAvailable, (guild) => guild.members.fetch().catch(console.error))

export async function membersFetched() {
    await fetched
}
