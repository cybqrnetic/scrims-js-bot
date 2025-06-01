import { GatewayIntentBits } from "discord.js"
import mongoose from "mongoose"

import { connectDatabase, connectRedis, disconnectDatabase, disconnectRedis } from "../db"
import { bot, BotModule, commands, connectDiscord, disconnectDiscord } from "../discord"
import { I18n } from "../utils/I18n"
import { ModuleLoader } from "./ModuleLoader"

import { Settings } from "luxon"
Settings.defaultZone = "UTC"

const DEFAULT_INTENTS = [GatewayIntentBits.DirectMessages]
const TEST = process.env["TEST"]?.toLowerCase() === "true"

type Entrypoint = { include?: string[]; exclude?: string[]; intents?: GatewayIntentBits[] }

export class Bootstrap {
    entrypoints: Record<string, Entrypoint> = {}

    withEntrypoint(name: string, entrypoint: Entrypoint) {
        this.entrypoints[name] = entrypoint
        return this
    }

    async start(command: string | Entrypoint = "default") {
        if (typeof command === "string") {
            const entrypoint = this.entrypoints[command]
            if (!entrypoint) {
                console.error("Unknown command '%s'!", command)
                process.exit(1)
            }

            await runEntrypoint(command, entrypoint)
        } else {
            await runEntrypoint("default", command)
        }
    }
}

async function runEntrypoint(name: string, entrypoint: Entrypoint) {
    await I18n.loadLocales("./src/assets/lang")

    const modules = new ModuleLoader(name)
    for (const include of entrypoint.include ?? []) {
        await modules.load(include, entrypoint.exclude)
    }

    if (TEST) {
        showDebug(name, modules)
        process.exit(0)
    }

    try {
        await startup(DEFAULT_INTENTS.concat(entrypoint.intents ?? []))
    } catch (error) {
        console.error(error)
        shutdown(1)
    }
}

function getLine(title: string = "") {
    return `\n\x1b[90m=============== ${title} =================\x1b[0m\n`
}

function showDebug(command: string, modules: ModuleLoader) {
    console.log(
        `\x1b[32m${command.toUpperCase()} loaded successfully:` +
            `${getLine("Intents")}${bot.options.intents.toArray().join("\n") || "None"}` +
            `${getLine("Modules")}${Object.keys(BotModule.instances).join("\n") || "None"}` +
            `${getLine("Commands")}${commands.getRegistered().join("\n") || "None"}` +
            `${getLine("Models")}${mongoose.modelNames().join("\n") || "None"}` +
            `${getLine("Imports")}${modules.getLoaded().join("\n") || "None"}\n`,
    )
}

declare module "discord.js" {
    interface ClientEvents {
        initialized: []
    }
}

async function startup(intents: GatewayIntentBits[]) {
    await Promise.all([connectRedis(), connectDatabase()])
    await Promise.all([connectDiscord(intents), bot.ready()])

    bot.emit("initialized")
    console.log("Startup complete!")
}

process.on("SIGTERM", () => shutdown(0))
process.on("SIGINT", () => shutdown(0))

function shutdown(code: number) {
    console.log("Shutting down...")

    const shutdown = Promise.all([
        disconnectDiscord().catch(console.debugError),
        disconnectRedis().catch(console.debugError),
        disconnectDatabase().catch(console.debugError),
    ])

    const timeout = sleep(3000).then(() => {
        throw new Error("Shuting down took too long!")
    })

    Promise.race([shutdown, timeout])
        .catch(console.error)
        .finally(() => process.exit(code))
}
