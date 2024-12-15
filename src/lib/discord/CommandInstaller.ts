import {
    ApplicationCommandType,
    ApplicationIntegrationType,
    ChatInputCommandInteraction,
    ContextMenuCommandBuilder,
    Events,
    InteractionContextType,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
    SlashCommandSubcommandsOnlyBuilder,
    type AutocompleteInteraction,
    type CacheType,
    type Client,
    type ContextMenuCommandInteraction,
    type Guild,
    type Interaction,
    type MessageComponentInteraction,
    type ModalSubmitInteraction,
} from "discord.js"

import { HOST_GUILD_ID } from "@Constants"
import { CommandHandler } from "./CommandHandler"

type CacheTypeReducer<UserInstall, AnyContext> = AnyContext extends true
    ? UserInstall extends true
        ? CacheType
        : "cached" | undefined
    : UserInstall extends true
      ? "cached" | "raw"
      : "cached"

const commands = new Set<Command>()
export function SlashCommand<UserInstall extends boolean = false, AnyContext extends boolean = false>(
    command: CommandBase<
        SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder,
        UserInstall,
        AnyContext,
        ChatInputCommandInteraction<CacheTypeReducer<UserInstall, AnyContext>>
    >,
) {
    commands.add(command)
    return command
}

export function ContextMenu<UserInstall extends boolean = false, AnyContext extends boolean = false>(
    command: CommandBase<
        ContextMenuCommandBuilder,
        UserInstall,
        AnyContext,
        ContextMenuCommandInteraction<CacheTypeReducer<UserInstall, AnyContext>>
    >,
) {
    commands.add(command)
    return command
}

export function Component<UserInstall extends boolean = false, AnyContext extends boolean = false>(
    command: CommandBase<
        string,
        UserInstall,
        AnyContext,
        MessageComponentInteraction<CacheTypeReducer<UserInstall, AnyContext>>
    >,
) {
    commands.add(command)
    return command
}

export class CommandInstaller {
    static getCommandNames() {
        return Array.of(...commands).map(({ builder }) => {
            if (builder instanceof SlashCommandBuilder) return `/${builder.name}`
            if (builder instanceof ContextMenuCommandBuilder)
                return `${builder.name} (${ApplicationCommandType[builder.type]} Context)`
            return `${builder} (Component)`
        })
    }

    private readonly handler = new CommandHandler()
    private readonly globalCommands: CommandBuilder[] = []
    private readonly guildCommands: Record<string, CommandBuilder[]> = {}

    constructor(readonly bot: Client) {
        commands.forEach((cmd) => this.installCommand(cmd))
        this.bot
            .on(Events.GuildCreate, (guild) => this.postGuildCommands(guild))
            .on(Events.ClientReady, async (client) => {
                await this.postCommands(client)
                this.bot.on(Events.InteractionCreate, (i) => this.handler.handleInteraction(i))
                console.log("[CommandInstaller] Commands posted. Now accepting interactions.")
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
        return guild.commands.set(this.guildCommands[guild.id] ?? []).catch(console.error)
    }

    private getCommandCallback({
        handler,
        builder,
        handleAutocomplete,
        handleComponent,
        handleModalSubmit,
        mixedHandler,
    }: Command) {
        const isHandler: (i: Interaction) => boolean =
            typeof builder === "string" ? (i) => i.isMessageComponent() : (i) => i.isChatInputCommand()

        return async (i: Interaction) => {
            if (isHandler(i)) {
                await handler?.(i)
            } else if (i.isMessageComponent()) {
                await handleComponent?.(i)
            } else if (i.isAutocomplete()) {
                await handleAutocomplete?.(i)
            } else if (i.isModalSubmit()) {
                await handleModalSubmit?.(i)
            }

            await mixedHandler?.(i)
        }
    }

    private installCommand(command: Command) {
        const { builder, config } = command
        if (typeof builder !== "string") {
            if (config?.restricted) {
                config.forceGuild = true
                config.guilds = [HOST_GUILD_ID]
                builder.setDefaultMemberPermissions("0")
            } else if (config?.permission && builder.default_member_permissions === undefined) {
                config.forceGuild = true
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
        }

        const id = typeof builder === "string" ? builder : builder.name
        this.handler.addHandler(id, { callback: this.getCommandCallback(command), config })
    }
}

export interface CommandConfig {
    permission?: string
    restricted?: boolean
    guilds?: string[]
    forceGuild?: boolean
    defer?: "update" | "reply" | "ephemeral_reply"
}

export interface CommandBase<B, UserInstall, AnyContext, I> {
    builder: B
    userInstall?: UserInstall
    anyContext?: AnyContext
    config?: CommandConfig
    handler?: (interaction: I) => Promise<unknown>
    handleAutocomplete?: (
        interaction: AutocompleteInteraction<CacheTypeReducer<UserInstall, AnyContext>>,
    ) => Promise<unknown>
    handleComponent?: (
        interaction: MessageComponentInteraction<CacheTypeReducer<UserInstall, AnyContext>>,
    ) => Promise<unknown>
    handleModalSubmit?: (
        interaction: ModalSubmitInteraction<CacheTypeReducer<UserInstall, AnyContext>>,
    ) => Promise<unknown>
    mixedHandler?: (interaction: any) => Promise<unknown>
}

export type Command = CommandBase<string | CommandBuilder, boolean, boolean, any>
export type CommandBuilder =
    | ContextMenuCommandBuilder
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder
