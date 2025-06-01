import { GatewayIntentBits } from "discord.js"
import { Bootstrap } from "lib"

const PUBLIC_FEATURES = ["modules/vouch-system", "modules/ranked"]

await new Bootstrap()
    .withEntrypoint("external", { include: ["modules/admin-commands", ...PUBLIC_FEATURES] })
    .withEntrypoint("internal", {
        include: ["modules"],
        exclude: PUBLIC_FEATURES,
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
    })
    .start(process.argv[2]?.toLowerCase())
