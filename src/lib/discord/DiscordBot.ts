import { Client, ClientEvents, GatewayIntentBits, Partials, PresenceData, Role } from "discord.js"

import { HOST_GUILD_ID } from "@Constants"
import { AuditedEventEmitter } from "./AuditedEvents"
import { CommandInstaller } from "./CommandInstaller"
import { PartialsHandledEventEmitter } from "./PartialsHandledEvents"

export interface Base {
    client: DiscordBot
}

export interface BotConfig {
    intents: GatewayIntentBits[]
    presence?: PresenceData
}

declare module "discord.js" {
    interface ClientEvents {
        initialized: []
    }
}

export function BotListener<E extends keyof ClientEvents>(
    event: E,
    listener: (bot: DiscordBot, ...args: ClientEvents[E]) => unknown,
) {
    DiscordBot.useBot((bot) => bot.on(event, (...args) => listener(bot, ...args) as void))
}

const useCalls = new Set<(bot: DiscordBot) => unknown>()
export class DiscordBot<Ready extends boolean = boolean> extends Client<Ready> {
    static INSTANCE?: DiscordBot
    static useBot(cb: (bot: DiscordBot) => unknown) {
        if (this.INSTANCE) cb(this.INSTANCE)
        else useCalls.add(cb)
    }

    static getInstance() {
        return this.INSTANCE!
    }

    readonly intents: GatewayIntentBits[]
    readonly hostGuildId: string

    readonly auditedEvents = new AuditedEventEmitter(this)
    readonly partialsHandledEvents = new PartialsHandledEventEmitter(this)
    readonly commands = new CommandInstaller(this)

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

        super({ partials, intents: config.intents, presence: config.presence })
        this.intents = config.intents
        this.hostGuildId = HOST_GUILD_ID

        this.setMaxListeners(100)
        this.on("error", console.error)

        DiscordBot.INSTANCE = this
        useCalls.forEach((call) => call(this))
        useCalls.clear()
    }

    get host() {
        return this.guilds.cache.get(this.hostGuildId)
    }

    hasRolePermissions(role: Role) {
        if (role.managed || role.id === role.guild.id) return false

        const botMember = role.guild.members.me
        if (!botMember?.permissions?.has("ManageRoles", true)) return false
        return botMember.roles.highest.comparePositionTo(role) > 0
    }
}
