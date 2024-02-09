import { ActivityType, GatewayIntentBits, PresenceData } from "discord.js"
import { globSync } from "glob"

import { Settings } from "luxon"
Settings.defaultZone = "UTC"

import moduleAlias from "module-alias"
moduleAlias.addAlias("lib", __dirname + "/lib/index.js")
moduleAlias.addAlias("@Constants", __dirname + "/Constants.js")

import { ASSETS, HOST_GUILD_ID } from "@Constants"
import { I18n, ScrimsBot } from "lib"

function requireAll(pattern: string) {
    return globSync(pattern, { cwd: __dirname }).map(
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        (path) => Object.values(require(`./${path}`))[0],
    ) as Function[]
}

async function main() {
    I18n.loadLocales(ASSETS + "lang")
    requireAll("modules/**/*.js")

    const intents = [
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
    ]

    const presence: PresenceData = {
        activities: [{ type: ActivityType.Custom, name: "Keeping track of Vouches" }],
    }

    let bot = new ScrimsBot({ hostGuildId: HOST_GUILD_ID, intents, presence })
    if (process.argv[2] === "test") {
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
