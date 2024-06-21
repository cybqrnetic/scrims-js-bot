import { ActivityType, GatewayIntentBits, PresenceData } from "discord.js"
import { globSync } from "glob"

import { Settings } from "luxon"
Settings.defaultZone = "UTC"

import moduleAlias from "module-alias"
moduleAlias.addAlias("lib", __dirname + "/lib/index.js")
moduleAlias.addAlias("@Constants", __dirname + "/Constants.js")

import { ASSETS, HOST_GUILD_ID } from "@Constants"
import { I18n, ScrimsBot } from "lib"

const PUBLIC = process.env.PUBLIC_BOT
const TEST = process.argv[2] === "test"

function requireAll(pattern: string) {
    for (const path of globSync(pattern, { cwd: __dirname })) {
        if (path.includes("internal") && PUBLIC) continue
        if (TEST) console.log(path)
        require(`./${path}`)
    }
}

async function main() {
    I18n.loadLocales(ASSETS + "lang")

    let intents: GatewayIntentBits[]

    if (PUBLIC) {
        requireAll("modules/exchange/**/*.js")
        requireAll("modules/vouch-system/**/*.js")
        intents = []
    } else {
        requireAll("modules/**/*.js")
        intents = [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildModeration,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildPresences,
        ]
    }

    const presence: PresenceData = {
        activities: [{ type: ActivityType.Custom, name: process.env.PRESENCE! }],
    }

    const bot = new ScrimsBot({ hostGuildId: HOST_GUILD_ID, servesHost: true, intents, presence })
    if (TEST) {
        console.log(String.raw`Appears to be in order ¯\_(ツ)_/¯`)
        process.exit(0)
    } else {
        await bot.login()
    }

    process.on("SIGINT", () => bot.destroy().then(() => process.exit(0)))
    process.on("SIGTERM", () => bot.destroy().then(() => process.exit(0)))
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
