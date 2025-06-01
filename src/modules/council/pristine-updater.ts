import { Events, GuildMember } from "discord.js"
import { BotListener, getMainGuild, MAIN_GUILD_ID } from "lib"

import { RANKS } from "@Constants"
import { OnlinePositions, PositionRole } from "@module/positions"

BotListener(Events.ClientReady, () => {
    void PositionRole.cache.initialized().then(() => {
        getMainGuild()?.members.cache.forEach((m) => givePristineIfPrime(m).catch(console.error))
    })
})

BotListener(Events.GuildMemberUpdate, (_bot, oldMember, newMember) => {
    if (oldMember.guild.id === MAIN_GUILD_ID) {
        if (!oldMember.roles.cache.equals(newMember.roles.cache)) {
            givePristineIfPrime(newMember).catch(console.error)
        }
    }
})

async function givePristineIfPrime(member: GuildMember) {
    if (OnlinePositions.hasPosition(member, RANKS.Prime)) {
        const roles = PositionRole.getPermittedRoles(RANKS.Pristine, MAIN_GUILD_ID)
        await Promise.all(
            roles
                .filter((r) => !member.roles.cache.has(r.id))
                .map((r) => member.roles.add(r, `Given Pristine for having Prime.`)),
        )
    }
}
