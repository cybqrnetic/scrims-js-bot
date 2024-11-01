import { Events } from "discord.js"
import { BotListener, Config, PositionRole } from "lib"

import { RANKS, ROLE_APP_HUB } from "@Constants"
import { VouchDuelSession } from "./VouchDuelSession"

const RANK_CHANNELS = Object.values(RANKS).map((rank) => [
    Config.declareType(`${rank} Council Duels Channel`),
    rank,
])

const PING_POSITIONS = PositionRole.declarePositions(
    Object.fromEntries(Object.values(RANKS).map((rank) => [rank, `${rank} Duels Ping`])),
)

BotListener(Events.MessageCreate, async (bot, msg) => {
    if (msg.guildId !== ROLE_APP_HUB || msg.content.toLowerCase() !== "$duels") return

    const rank = RANK_CHANNELS.find(
        ([config]) => bot.getConfigValue(config, msg.guildId!) === msg.channelId,
    )?.[1]

    if (!rank || !bot.permissions.hasPosition(msg.author, `${rank} Council`)) return

    const role = PositionRole.getRoles(PING_POSITIONS[rank], msg.guildId)[0]
    await Promise.all([msg.delete(), role ? msg.channel.send(`${msg.author}: ${role}`) : null])

    new VouchDuelSession(msg.author.id, rank)
})
