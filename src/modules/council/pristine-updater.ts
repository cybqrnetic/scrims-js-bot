import { Events, GuildMember } from "discord.js"
import { BotListener } from "lib"

import { HOST_GUILD_ID, RANKS } from "@Constants"
import { OnlinePositions, PositionRole } from "@module/positions"

BotListener(Events.ClientReady, (bot) => {
    PositionRole.cache.initialized().then(() => {
        bot.host?.members.cache.forEach((m) => givePristineIfPrime(m).catch(console.error))
    })
})

BotListener(Events.GuildMemberUpdate, (_bot, oldMember, newMember) => {
    if (oldMember.guild.id === HOST_GUILD_ID) {
        if (!oldMember.roles.cache.equals(newMember.roles.cache)) {
            givePristineIfPrime(newMember).catch(console.error)
        }
    }
})

async function givePristineIfPrime(member: GuildMember) {
    if (OnlinePositions.hasPosition(member, RANKS.Prime)) {
        const roles = PositionRole.getPermittedRoles(RANKS.Pristine, HOST_GUILD_ID)
        await Promise.all(
            roles
                .filter((r) => !member.roles.cache.has(r.id))
                .map((r) => member.roles.add(r, `Given Pristine for having Prime.`)),
        )
    }
}
