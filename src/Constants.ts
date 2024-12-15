import { Colors as DiscordColors } from "discord.js"
import ThisColors from "./assets/colors.json"

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

export { default as Emojis } from "./assets/emojis.json"
export { default as Links } from "./assets/links.json"

export const ASSETS = process.cwd() + "/src/assets/"
export const TEST = process.env["TEST"]?.toLowerCase() === "true"
export const HOST_GUILD_ID = process.env["HOST_GUILD_ID"] ?? "759894401957888031"
export const ROLE_APP_HUB = process.env["ROLE_APP_HUB"] ?? "874783384042340392"

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
