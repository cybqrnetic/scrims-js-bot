import { Colors as DiscordColors } from "discord.js"
import ThisColors from "./assets/colors.json"
import { Permissions, PositionRole } from "./lib"

export const ASSETS = process.cwd() + "/src/assets/"

Object.entries(ThisColors).forEach(([k, v]) =>
    Object.defineProperty(DiscordColors, k, { value: parseInt(v), configurable: true }),
)

export const Colors = DiscordColors as typeof DiscordColors & {
    [K in keyof typeof ThisColors]: number
}

export const Positions = PositionRole.declarePositions({
    Staff: "Staff",
    TrialStaff: "Trial Staff",
    Support: "Support",
    TrialSupport: "Trial Support",

    Member: "Bridge Scrims Member",
    Banned: "Banned",
    Muted: "Muted",

    SupportBlacklisted: "Support Blacklisted",
    SuggestionsBlacklisted: "Suggestions Blacklisted",
})

export const RANKS = PositionRole.declarePositions({
    Pristine: "Pristine",
    Prime: "Prime",
    Private: "Private",
    Premium: "Premium",
})

for (const rank of Object.values(RANKS)) {
    PositionRole.declarePosition(`${rank} Council`)
    PositionRole.declarePosition(`${rank} Head`)
}

export const COUNCIL_PERMISSIONS: Permissions = {
    positions: Object.values(RANKS).map((rank) => `${rank} Council`),
}

export const COUNCIL_HEAD_PERMISSIONS: Permissions = {
    positions: Object.values(RANKS).map((rank) => `${rank} Head`),
}

export { default as Emojis } from "./assets/emojis.json"
export { default as Links } from "./assets/links.json"

export const HOST_GUILD_ID = process.env.HOST_GUILD_ID ?? "759894401957888031"
export const ROLE_APP_HUB = process.env.ROLE_APP_HUB ?? "874783384042340392"
export const TOURNEY_ID = process.env.TOURNEY_ID ?? 13089130
