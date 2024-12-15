import { ActivityType, GatewayIntentBits, PresenceData } from "discord.js"
import mongoose from "mongoose"

import { Settings } from "luxon"
Settings.defaultZone = "UTC"

import { ASSETS, TEST } from "@Constants"
import { BotModule, CommandInstaller, DB, DiscordBot, I18n, PersistentData, redis, subscriber } from "lib"
import { ModuleLoader } from "./ModuleLoader"

type Entrypoint = { include?: string[]; exclude?: string[]; intents?: GatewayIntentBits[] }
const ENTRYPOINTS: Record<string, Entrypoint> = {
    external: {
        include: ["modules/vouch-system", "modules/ranked"],
    },
    internal: {
        include: ["modules"],
        exclude: ["modules/vouch-system", "modules/ranked"],
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildPresences,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildModeration,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.GuildVoiceStates,
        ],
    },
}

const command = process.argv[2]?.toLowerCase() ?? ""
const entrypoint = ENTRYPOINTS[command]
if (!entrypoint) {
    console.error("Unknown command '%s'!", command)
    process.exit(1)
}

I18n.loadLocales(ASSETS + "lang")

const modules = new ModuleLoader(command)
for (const include of entrypoint.include ?? []) {
    await modules.load(include, entrypoint.exclude)
}

const intents = [GatewayIntentBits.DirectMessages]
if (entrypoint.intents) intents.push(...entrypoint.intents)

const presence = resolvePresence()
const bot = new DiscordBot({ intents, presence })

process.on("SIGTERM", () => shutdown(0))
process.on("SIGINT", () => shutdown(0))

try {
    if (TEST) {
        console.log(
            `\x1b[32m${command!.toUpperCase()} loaded successfully:` +
                `${getLine("Intents")}${intents.map((v) => GatewayIntentBits[v]).join("\n") || "None"}` +
                `${getLine("Modules")}${Object.keys(BotModule.instances).join("\n") || "None"}` +
                `${getLine("Commands")}${CommandInstaller.getCommandNames().join("\n") || "None"}` +
                `${getLine("Models")}${DB.getModels().join("\n") || "None"}` +
                `${getLine("Imports")}${modules.getLoaded().join("\n") || "None"}\n`,
        )
        process.exit(0)
    } else {
        await startup(bot)
    }
} catch (error) {
    console.error(error)
    await shutdown(1)
}

function getLine(title: string = "") {
    return `\n\x1b[90m=============== ${title} =================\x1b[0m\n`
}

function resolvePresence(): PresenceData | undefined {
    const presence = process.env["PRESENCE"]
    if (presence) {
        return {
            activities: [{ type: ActivityType.Custom, name: presence }],
        }
    }

    return undefined
}

async function startup(bot: DiscordBot) {
    await bot.login(process.env["BOT_TOKEN"]!)

    if (!bot.host) console.warn("Host Guild not Available!")
    else if (bot.intents.includes(GatewayIntentBits.GuildMembers)) {
        await bot.host.members.fetch()
        await bot.host.channels.fetch()
        await bot.host.emojis.fetch()
    }

    console.log(`Connected to Discord as ${bot.user?.tag}.`, {
        Guilds: bot.guilds.cache.size,
        HostGuild: bot.host?.id,
        HostMembers: bot.host?.members?.cache.size,
        HostChannels: bot.host?.channels?.cache.size,
        HostEmojis: bot.host?.emojis?.cache.size,
    })

    await mongoose
        .connect(process.env["MONGO_URI"]!, { connectTimeoutMS: 7000, serverSelectionTimeoutMS: 7000 })
        .then(({ connection }) => {
            connection.on("error", console.error)
            console.log(`Connected to database ${connection.name}.`)
        })

    bot.emit("initialized")
    console.log("Startup complete!")
}

async function shutdown(code: number) {
    console.log("Shutting down...")
    await Promise.race([
        Promise.all([
            bot.destroy().catch(console.debugError),
            mongoose.disconnect().catch(console.debugError),
            redis.disconnect().catch(console.debugError),
            subscriber.disconnect().catch(console.debugError),
            PersistentData.save().catch(console.debugError),
        ]),
        sleep(3000),
    ])
    process.exit(code)
}
