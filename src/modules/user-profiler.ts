import { Events } from "discord.js"
import { BotListener, UserProfile } from "lib"

BotListener(Events.ClientReady, async (bot) => {
    if (bot.host)
        await UserProfile.bulkWrite(
            bot.host.members.cache.map((m) => ({
                updateOne: {
                    filter: { _id: m.id },
                    update: { username: m.user.tag, $setOnInsert: { joinedAt: m.joinedAt! } },
                    upsert: true,
                },
            })),
        )
})

BotListener(Events.GuildMemberAdd, async (bot, member) => {
    if (member.guild.id === bot.hostGuildId) {
        await UserProfile.updateOne(
            { _id: member.id },
            { username: member.user.tag, $setOnInsert: { joinedAt: member.joinedAt! } },
            { upsert: true },
        )
    }
})

BotListener(Events.UserUpdate, async (bot, oldUser, newUser) => {
    if (oldUser.tag !== newUser.tag)
        await UserProfile.updateOne({ _id: newUser.id }, { username: newUser.tag })
})
