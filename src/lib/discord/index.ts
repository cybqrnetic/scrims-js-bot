import { ActivityType, Client, GatewayIntentBits, IntentsBitField, Partials } from "discord.js"
import { AuditedEventEmitter } from "./AuditedEvents"
import { CommandInstaller } from "./CommandInstaller"

const partials = [
    Partials.GuildMember,
    Partials.User,
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.ThreadMember,
    Partials.GuildScheduledEvent,
]

interface Bot<Ready extends boolean> extends Client<Ready> {
    ready(): Promise<Bot<true>>
}

export const bot = new Client({ partials, intents: [] }) as Bot<boolean>
bot.on("error", console.error)
bot.setMaxListeners(100)

const ready = new Promise<Client<true>>((res) => bot.once("ready", res))
bot.ready = () => ready as Promise<Bot<true>>

export async function connectDiscord(intents: GatewayIntentBits[]) {
    bot.options.intents = new IntentsBitField(intents)

    const presence = process.env["PRESENCE"]
    if (presence) {
        bot.options.presence = { activities: [{ type: ActivityType.Custom, name: presence }] }
    }

    await bot.login(process.env["BOT_TOKEN"]).then(() => {
        console.log(`Connected to Discord as ${bot.user?.tag}.`, {
            Guilds: bot.guilds.cache.size,
        })
    })
}

export async function disconnectDiscord() {
    await bot.destroy()
}

export const auditedEvents = new AuditedEventEmitter(bot)
export const commands = new CommandInstaller(bot)

export const MAIN_GUILD_ID = process.env["MAIN_GUILD_ID"]!
export function getMainGuild() {
    return bot.guilds.cache.get(MAIN_GUILD_ID)
}

export * from "./utils/localization-hooks"
export * from "./utils/MessageFloater"
export * from "./utils/StatusChannel"

export * from "./api"
export * from "./AuditedEvents"
export * from "./BotModule"
export * from "./CommandHandler"
export * from "./CommandInstaller"
export * from "./Permissions"
