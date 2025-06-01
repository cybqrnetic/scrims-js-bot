import { Events } from "discord.js"
import { BotListener } from "lib"

import { RANKS, ROLE_APP_HUB } from "@Constants"
import { Config } from "@module/config"
import { PositionRole } from "@module/positions"
import { VouchDuelSession } from "./VouchDuelSession"

const channelRanks: Record<string, string> = {}
for (const rank of Object.values(RANKS)) {
    const key = Config.declareType(`${rank} Council Duels Channel`)
    Config.onCache("add", key, (config) => (channelRanks[config.value] = rank))
    Config.onCache("delete", key, (config) => delete channelRanks[config.value])
}

const PING_POSITIONS = PositionRole.declarePositions(
    Object.fromEntries(Object.values(RANKS).map((rank) => [rank, `${rank} Duels Ping`])),
)

BotListener(Events.MessageCreate, async (_bot, msg) => {
    if (msg.guildId !== ROLE_APP_HUB || msg.content.toLowerCase() !== "$duels") return

    const rank = channelRanks[msg.channelId]
    if (!rank || !msg.author.hasPermission(`council.${rank.toLowerCase()}.vouchDuels`)) return

    const role = PositionRole.getRoles(PING_POSITIONS[rank]!, msg.guildId)[0]
    await Promise.all([msg.delete(), role ? msg.channel.send(`${msg.author}: ${role}`) : null])

    VouchDuelSession.create(msg.author.id, rank)
})
