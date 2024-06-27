import { Events, GuildMember } from "discord.js"
import { BotListener, PositionRole, ScrimsBot } from "lib"

import { HOST_GUILD_ID, RANKS } from "@Constants"

BotListener(Events.ClientReady, (bot) => {
    PositionRole.cache.initialized.await().then(() => {
        bot.host?.members.cache.forEach((m) => givePristineIfPrime(m).catch(console.error))
    })
})

BotListener(Events.GuildMemberUpdate, (bot, oldMember, newMember) => {
    if (oldMember.guild.id === HOST_GUILD_ID) {
        if (!oldMember.roles.cache.equals(newMember.roles.cache)) {
            givePristineIfPrime(newMember).catch(console.error)
        }
    }
})

async function givePristineIfPrime(member: GuildMember) {
    if (ScrimsBot.INSTANCE?.permissions.hasPosition(member, RANKS.Prime)) {
        const roles = PositionRole.getPermittedRoles(RANKS.Pristine, HOST_GUILD_ID)
        await Promise.all(
            roles
                .filter((r) => !member.roles.cache.has(r.id))
                .map((r) => member.roles.add(r, `Given Pristine for having Prime.`)),
        )
    }
}
