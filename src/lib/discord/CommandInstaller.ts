import {
    ApplicationCommandType,
    ApplicationIntegrationType,
    CacheType,
    ContextMenuCommandBuilder,
    Events,
    InteractionContextType,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
    SlashCommandSubcommandsOnlyBuilder,
    type AutocompleteInteraction,
    type Client,
    type Guild,
    type Interaction,
    type MessageComponentInteraction,
    type ModalSubmitInteraction,
} from "discord.js"

import { MAIN_GUILD_ID } from "."
import { CommandHandler } from "./CommandHandler"

export class CommandInstaller {
    private readonly handler = new CommandHandler()
    private readonly components: string[] = []
    private readonly globalCommands: CommandBuilder[] = []
    private readonly guildCommands: Record<string, CommandBuilder[]> = {}
    private readonly configs: Record<string, CommandConfig> = {}

    constructor(private readonly bot: Client) {
        this.bot
            .on(Events.GuildCreate, (guild) => this.postGuildCommands(guild))
            .on(Events.ClientReady, async (client) => {
                this.bot.on(Events.InteractionCreate, (i) => this.handler.handleInteraction(i))
                await this.postCommands(client)
                console.log("[CommandInstaller] Commands posted.")
            })
    }

    private async postCommands(client: Client<true>) {
        await Promise.all(
            Array.from(client.guilds.cache.values())
                .map((v) => this.postGuildCommands(v))
                .concat(client.application.commands.set(this.globalCommands).catch(console.error)),
        )
    }

    private async postGuildCommands(guild: Guild) {
        const commands = this.guildCommands[guild.id] ?? []
        if (process.env["NODE_ENV"] !== "production") commands.push(...this.globalCommands)

        return guild.commands.set(commands).catch(console.error)
    }

    private getCommandCallback({
        builder,
        handler,
        subHandlers,
        handleAutocomplete,
        handleComponent,
        componentHandlers,
        handleModalSubmit,
        mixedHandler,
    }: Command) {
        const isHandler: (i: Interaction) => boolean =
            typeof builder === "string" ? (i) => i.isMessageComponent() : (i) => i.isCommand()

        return async (i: Interaction) => {
            if (isHandler(i)) {
                await handler?.(i)
                await subHandlers?.[i.subCommandName!]?.(i)
            }

            if (i.isMessageComponent()) {
                await handleComponent?.(i)
                await componentHandlers?.[i.args.shift()!]?.(i)
            } else if (i.isAutocomplete()) {
                await handleAutocomplete?.(i)
            } else if (i.isModalSubmit()) {
                await handleModalSubmit?.(i)
            }

            await mixedHandler?.(i)
        }
    }

    public add(command: Command) {
        const { builder, config } = command
        if (typeof builder === "string") {
            this.components.push(builder)
        } else {
            if (config?.restricted) {
                command.anyContext = false
                command.userInstall = false
                config.guilds = [MAIN_GUILD_ID]
                builder.setDefaultMemberPermissions("0")
            } else if (config?.permission && builder.default_member_permissions === undefined) {
                builder.setDefaultMemberPermissions("0")
            }

            if (command.userInstall) {
                builder.setIntegrationTypes(
                    ApplicationIntegrationType.GuildInstall,
                    ApplicationIntegrationType.UserInstall,
                )
            } else {
                builder.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
            }

            if (command.anyContext) {
                builder.setContexts(
                    InteractionContextType.Guild,
                    InteractionContextType.BotDM,
                    InteractionContextType.PrivateChannel,
                )
            } else {
                builder.setContexts(InteractionContextType.Guild)
            }

            if (config?.guilds) {
                config.guilds.forEach((guild) => {
                    if (!this.guildCommands[guild]?.push(builder)) {
                        this.guildCommands[guild] = [builder]
                    }
                })
            } else {
                this.globalCommands.push(builder)
            }

            if (config) {
                this.configs[builder.name] = config
            }
        }

        const id = typeof builder === "string" ? builder : builder.name
        this.handler.addHandler(id, { callback: this.getCommandCallback(command), config })
    }

    public getRegistered() {
        return Array.from(new Set(this.globalCommands.concat(...Object.values(this.guildCommands))))
            .map((builder) => {
                if (builder instanceof ContextMenuCommandBuilder)
                    return `${builder.name} (${ApplicationCommandType[builder.type]} Context)`
                return `/${builder.name}`
            })
            .concat(this.components.map((name) => `${name} (Component)`))
    }

    public getConfig(name: string) {
        return this.configs[name]
    }

    public getConfigs() {
        return Object.values(this.configs)
    }
}

export interface CommandConfig {
    permission?: string
    restricted?: boolean
    guilds?: string[]
    defer?: "Update" | "Reply" | "EphemeralReply"
}

export type CacheTypeReducer<UserInstall, AnyContext> = AnyContext extends true
    ? UserInstall extends true
        ? CacheType
        : "cached" | undefined
    : UserInstall extends true
      ? "cached" | "raw"
      : "cached"

type ComponentHandler<I, C> = (i: MessageComponentInteraction<CacheTypeReducer<I, C>>) => unknown

export interface CommandBase<B, UserInstall, AnyContext, I> {
    builder: B
    userInstall?: UserInstall
    anyContext?: AnyContext
    config?: CommandConfig
    handler?: (interaction: I) => unknown
    subHandlers?: Record<string, (interaction: I) => unknown>
    handleAutocomplete?: (
        interaction: AutocompleteInteraction<CacheTypeReducer<UserInstall, AnyContext>>,
    ) => unknown
    handleComponent?: ComponentHandler<UserInstall, AnyContext>
    componentHandlers?: Record<string, ComponentHandler<UserInstall, AnyContext>>
    handleModalSubmit?: (
        interaction: ModalSubmitInteraction<CacheTypeReducer<UserInstall, AnyContext>>,
    ) => unknown
    mixedHandler?: (interaction: Interaction) => unknown
}

export type Command = CommandBase<string | CommandBuilder, boolean, boolean, unknown>

export type CommandBuilder =
    | ContextMenuCommandBuilder
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder
