export { default as Emojis } from "./assets/emojis.json" with { type: "json" }
export { default as Links } from "./assets/links.json" with { type: "json" }

import { Colors as DiscordColors } from "discord.js"
import ThisColors from "./assets/colors.json" with { type: "json" }

Object.entries(ThisColors).forEach(([k, v]) =>
    Object.defineProperty(DiscordColors, k, { value: parseInt(v), configurable: true }),
)

export const Colors = DiscordColors as typeof DiscordColors & {
    [K in keyof typeof ThisColors]: number
}

export const RANKS = {
    Pristine: "Pristine",
    Prime: "Prime",
    Private: "Private",
    Premium: "Premium",
}

export const MAIN_GUILD_ID = process.env["MAIN_GUILD_ID"]!
export const ROLE_APP_HUB = process.env["ROLE_APP_HUB"]!

export const RANKED_SEASON = process.env["RANKED_SEASON"] ?? "test"
export const DEFAULT_ELO = process.env["DEFAULT_ELO"] ?? "1000"

export const RankedStats = {
    Elo: `ranked.${RANKED_SEASON}.elo`,
    Wins: `ranked.${RANKED_SEASON}.wins`,
    Losses: `ranked.${RANKED_SEASON}.losses`,
    Draws: `ranked.${RANKED_SEASON}.draws`,
    WinStreak: `ranked.${RANKED_SEASON}.winStreak`,
    BestStreak: `ranked.${RANKED_SEASON}.bestWinStreak`,
}
