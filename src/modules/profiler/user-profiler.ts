import { Events } from "discord.js"
import { BotListener, getMainGuild, MAIN_GUILD_ID } from "lib"

import { membersFetched } from "@module/member-fetcher"
import { UserProfile } from "./UserProfile"

membersFetched()
    .then(async () => {
        const guild = getMainGuild()
        if (guild) {
            await UserProfile.bulkWrite(
                guild.members.cache.map((m) => ({
                    updateOne: {
                        filter: { _id: m.id },
                        update: { username: m.user.tag, $setOnInsert: { joinedAt: m.joinedAt! } },
                        upsert: true,
                    },
                })),
            )
        }
    })
    .catch(console.error)

BotListener(Events.GuildMemberAdd, async (bot, member) => {
    if (member.guild.id === MAIN_GUILD_ID) {
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
