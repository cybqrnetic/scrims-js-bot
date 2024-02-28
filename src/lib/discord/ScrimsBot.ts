import {
    ChannelType,
    Client,
    ClientEvents,
    Events,
    GatewayIntentBits,
    Guild,
    Message,
    Partials,
    PresenceData,
    Role,
} from "discord.js"

import mongoose from "mongoose"
import { Config, redis, reloadCache, subscriber } from "../db"

import { HypixelClient } from "../apis/Hypixel"
import { MessageOptionsBuilder } from "../utils/MessageOptionsBuilder"

import { AuditedEventEmitter } from "./AuditedEvents"
import { BotMessageManager } from "./BotMessageManager"
import { CommandInstaller } from "./CommandInstaller"
import { PartialsHandledEventEmitter } from "./PartialsHandledEvents"
import { PermissionsManager } from "./PermissionsManager"

export interface Base {
    client: ScrimsBot
}

export interface BotConfig {
    intents: GatewayIntentBits[]
    presence?: PresenceData
    profiling?: boolean
    hostGuildId: string
    servesHost?: boolean
}

export function BotListener<E extends keyof ClientEvents>(
    event: E,
    listener: (bot: ScrimsBot, ...args: ClientEvents[E]) => unknown,
) {
    ScrimsBot.useBot((bot) => bot.on(event, (...args) => listener(bot, ...args) as void))
}

const useCalls = new Set<(bot: ScrimsBot) => unknown>()
export class ScrimsBot extends Client {
    static INSTANCE?: ScrimsBot
    static useBot(cb: (bot: ScrimsBot) => unknown) {
        if (this.INSTANCE) cb(this.INSTANCE)
        else useCalls.add(cb)
    }

    readonly hostGuildId: string
    readonly servesHost: boolean

    readonly auditedEvents = new AuditedEventEmitter(this)
    readonly partialsHandledEvents = new PartialsHandledEventEmitter(this)

    readonly commands = new CommandInstaller(this)
    readonly permissions = new PermissionsManager(this)
    readonly messages = new BotMessageManager(this)
    readonly hypixel = new HypixelClient()

    constructor(config: BotConfig) {
        const partials = [
            Partials.GuildMember,
            Partials.User,
            Partials.Message,
            Partials.Channel,
            Partials.Reaction,
            Partials.ThreadMember,
            Partials.GuildScheduledEvent,
        ]

        /**
         * Guilds, GuildMembers & GuildPresences is required to
         * keep the host (Bridge Scrims) guild members cached for the permissions system.
         * DirectMessages e.g. for !restart command you can DM the bot
         */
        const intents = Array.from(
            new Set([
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildPresences,
                GatewayIntentBits.DirectMessages,
                ...config.intents,
            ]),
        )

        super({ partials, intents, presence: config.presence })
        this.hostGuildId = config.hostGuildId
        this.servesHost = config.servesHost ?? false

        this.on("error", console.error)
        this.on("shardError", console.error)

        ScrimsBot.INSTANCE = this
        useCalls.forEach((call) => call(this))
        useCalls.clear()
    }

    /** @override */
    async destroy() {
        await Promise.race([
            super.destroy().catch(console.debugError),
            mongoose.disconnect().catch(console.debugError),
            redis.disconnect().catch(console.debugError),
            subscriber.disconnect().catch(console.debugError),
            sleep(3000),
        ])
    }

    get host() {
        return this.guilds.cache.get(this.hostGuildId)
    }

    getConfigValue(key: string, guildId: string, def?: string) {
        return Config.getConfigValue(key, guildId, def)
    }

    getConfig(type: string) {
        return Config.getConfig(type)
    }

    async login() {
        const res = await super.login(process.env.BOT_TOKEN)

        if (!this.host) console.warn("Host Guild Not Available!")
        else {
            await this.host.channels.fetch()
            await this.host.members.fetch()
        }

        console.log(`Connected to Discord as ${this.user?.tag}.`, {
            Guilds: this.guilds.cache.size,
            HostGuild: this.host?.id,
            HostMembers: this.host?.members.cache.size,
            HostChannels: this.host?.channels.cache.size,
        })

        await mongoose
            .connect(process.env.MONGO_URI!, { connectTimeoutMS: 7000, serverSelectionTimeoutMS: 7000 })
            .then((conn) => console.log(`Connected to database ${conn.connection.name}.`))

        this.emit("databaseConnected")

        this.addEventListeners()
        this.commands.initialize().then(() => console.log("Commands initialized!"))

        this.emit("initialized")
        console.log("Startup complete!")
        return res
    }

    hasRolePermissions(role: Role) {
        if (role.managed || role.id === role.guild.id) return false

        const botMember = role.guild.members.me
        if (!botMember?.permissions?.has("ManageRoles", true)) return false
        return botMember.roles.highest.comparePositionTo(role) > 0
    }

    addEventListeners() {
        this.on(Events.MessageCreate, (message) =>
            this.onMessageCommand(message)
                .then(() => undefined)
                .catch(console.error),
        )
    }

    async onMessageCommand(message: Message) {
        if (message.channel?.type === ChannelType.DM && message.content && message.author?.id) {
            if (message.author.id === "568427070020124672") {
                if (message.content === "!reload") {
                    await reloadCache()
                    await message.reply({ content: "Cache reloaded." })
                } else if (message.content === "!stop") {
                    console.log("Stop command used to terminate this process!")
                    await message.reply({ content: "👋 **Goodbye**" })
                    await this.destroy()
                    process.exit(0) // If the process exists with a success code it won't restart
                } else if (message.content === "!restart") {
                    console.log("Kill command used to terminate this process!")
                    await message.reply({ content: "👋 **Goodbye**" })
                    await this.destroy()
                    process.exit(1) // If the process exists with a error code it will be auto restarted
                }
            }
        }
    }

    allGuilds() {
        return Array.from(this.guilds.cache.values())
    }

    async buildSendLogMessages(
        configKey: string,
        guilds: string[] | null | undefined,
        builder: ((guild: Guild) => MessageOptionsBuilder | void) | MessageOptionsBuilder,
    ) {
        await this.buildSendMessages(configKey, guilds, builder, true)
    }

    async buildSendMessages(
        configKey: string,
        guilds: string[] | null | undefined,
        builder: ((guild: Guild) => MessageOptionsBuilder | void) | MessageOptionsBuilder,
        removeMentions?: boolean,
    ) {
        await Promise.all(
            (guilds ?? this.allGuilds()).map((guildId) => {
                const guild = this.guilds.resolve(guildId)
                if (guild) {
                    const payload = typeof builder === "function" ? builder(guild) : builder
                    if (payload) {
                        if (removeMentions) payload.removeMentions()
                        const channelId = this.getConfigValue(configKey, guild.id)
                        if (channelId) {
                            return guild.channels
                                .fetch(channelId)
                                .then((channel) => (channel?.isTextBased() ? channel.send(payload) : null))
                                .catch(console.debugError)
                        }
                    }
                }
            }),
        )
    }
}
