import {
    ApplicationCommand,
    ApplicationCommandData,
    Collection,
    ContextMenuCommandBuilder,
    Events,
    InteractionType,
    SlashCommandBuilder,
} from "discord.js"

import {
    AutocompleteInteraction,
    CommandHandler,
    CommandHandlerFunction,
    CommandHandlerInteraction,
    ComponentInteraction,
    ContextMenuInteraction,
    ModalSubmitInteraction,
    SlashCommandInteraction,
} from "./CommandHandler"

import { Permissions } from "./PermissionsManager"
import type { ScrimsBot } from "./ScrimsBot"

const commands = new Set()
export function Command<T extends string | ContextMenuCommandBuilder | SlashCommandBuilder>(
    command: Command<T>,
) {
    commands.add(command)
    return command
}

export class CommandInstaller {
    public readonly handler = new CommandHandler(this)

    protected appCommands = new Collection<string, ApplicationCommand>()
    protected commands: Set<Command> = commands as Set<Command>

    protected readonly commandBuilders: CommandBuilder[] = []
    protected readonly configurations: Record<string, CommandConfig> = {}

    constructor(readonly bot: ScrimsBot) {
        this.bot.on(Events.GuildCreate, () => this.update().catch(console.error))
    }

    async initialize() {
        if (!this.bot.application) throw new TypeError("ClientApplication does not exist...")
        this.installCommands()
        this.bot.on(Events.InteractionCreate, this.handler.handler)
        this.appCommands = await this.bot.application.commands.fetch({ withLocalizations: true })
        await this.update()
    }

    async update() {
        await this.updateCommands()
    }

    add(command: Command) {
        this.commands.add(command)
    }

    protected installCommands() {
        this.commands.forEach((cmd) => this.installCommand(cmd))
        this.commands.clear()
    }

    protected commandInteractionHandler({
        handler,
        builder,
        handleAutocomplete,
        handleComponent,
        handleModalSubmit,
        mixedHandler,
    }: Command): CommandHandlerFunction {
        return async (i) => {
            if (i.type === InteractionType.ApplicationCommandAutocomplete && handleAutocomplete)
                await handleAutocomplete(i)
            if (i.type === InteractionType.ModalSubmit && handleModalSubmit) await handleModalSubmit(i)
            if (i.type === InteractionType.MessageComponent && handleComponent) await handleComponent(i)
            if (
                ((i.type === InteractionType.ApplicationCommand &&
                    (builder instanceof SlashCommandBuilder ||
                        builder instanceof ContextMenuCommandBuilder)) ||
                    (i.type === InteractionType.MessageComponent && typeof builder === "string")) &&
                handler
            )
                await handler(i)
            if (mixedHandler) await mixedHandler(i)
        }
    }

    protected installCommand(command: Command) {
        if (command.command) command.builder = command.command
        const { builder, config } = command
        if (typeof builder !== "string") {
            // Important so that we can tell if the command changed or not
            // @ts-ignore
            builder.nsfw = false
            // @ts-ignore
            builder.options?.filter((option) => !option.type).forEach((option) => (option.type = 1))

            if (builder.dm_permission === undefined) builder.setDMPermission(!config?.forceGuild)

            this.commandBuilders.push(builder)
        }

        const id = typeof builder === "string" ? builder : builder.name
        const handler = this.commandInteractionHandler(command)
        this.handler.addHandler(id, handler)
        this.configurations[id] = config ?? {}
    }

    getCommandBuilder(name: string) {
        return this.commandBuilders.find((v) => v.name === name) ?? null
    }

    getCommandConfig(name: string) {
        return this.configurations[name] ?? {}
    }

    async updateCommands() {
        if (!this.bot.application) throw new TypeError("ClientApplication does not exist...")

        // UPDATING
        await Promise.all(this.appCommands.map((appCmd) => this.updateAppCommand(appCmd)))
        await Promise.all(
            this.commandBuilders.map((builder) => this.addAppCommand(builder, this.appCommands)),
        )

        for (const guild of this.bot.guilds.cache.values()) {
            const commands = await guild.commands.fetch({ withLocalizations: true })
            await Promise.all(commands.map((appCmd) => this.updateAppCommand(appCmd, guild.id)))
            await Promise.all(
                this.commandBuilders.map((builder) => this.addAppCommand(builder, commands, guild.id)),
            )
        }

        // RELOADING
        this.appCommands = await this.bot.application.commands.fetch({ withLocalizations: true })
    }

    isAllGuilds(guilds: string[]) {
        return (
            this.bot.guilds.cache.size === guilds.length &&
            this.bot.guilds.cache.every((v) => guilds.includes(v.id))
        )
    }

    getGuilds({ guilds }: CommandConfig = {}) {
        if (guilds) return guilds
        const allGuilds = Array.from(this.bot.guilds.cache.map((guild) => guild.id))
        return allGuilds
        // return allGuilds.filter((id) => id !== this.bot.hostGuildId || !common || this.bot.servesHost)
    }

    async updateAppCommand(appCmd: ApplicationCommand, guildId?: string) {
        const config = this.getCommandConfig(appCmd.name)
        const guilds = this.getGuilds(config)
        const builder = this.getCommandBuilder(appCmd.name)

        // Important to correctly determine if a command changed or not
        // @ts-ignore
        appCmd.options.filter((o) => o.type === 1 && !o.options).map((o) => (o.options = []))
        if (appCmd.dmPermission === null) appCmd.dmPermission = builder?.dm_permission ?? null

        if (appCmd) {
            if (
                builder &&
                ((!guildId && this.isAllGuilds(guilds)) || (guildId && guilds.includes(guildId))) &&
                !(this.isAllGuilds(guilds) && guildId)
            ) {
                if (!appCmd.equals(builder as ApplicationCommandData)) {
                    console.log(
                        `[CommandInstaller] Updating '${builder.name}' command ` +
                            (guildId ? `in ${guildId}.` : "globaly."),
                    )
                    await this.bot
                        .application!.commands.edit(appCmd.id, builder, guildId as any)
                        .catch((error) =>
                            console.error(`Unable to edit app command with id ${appCmd.id}!`, error),
                        )
                }
            } else {
                console.log(
                    `[CommandInstaller] Deleting '${appCmd.name}' command ` +
                        (guildId ? `in ${guildId}.` : "globaly."),
                )
                await this.bot
                    .application!.commands.delete(appCmd.id, guildId)
                    .catch((error) =>
                        console.error(`Unable to delete app command with id ${appCmd.id}!`, error),
                    )
            }
        }
    }

    async addAppCommand(
        builder: CommandBuilder,
        commands: Collection<string, ApplicationCommand>,
        guildId?: string,
    ) {
        const config = this.getCommandConfig(builder.name)
        const guilds = this.getGuilds(config)

        if (this.isAllGuilds(guilds) && guildId) return false
        if (!((this.isAllGuilds(guilds) && !guildId) || (guildId && guilds.includes(guildId)))) return false
        if (commands.find((cmd) => cmd.name === builder.name)) return false

        console.log(
            `[CommandInstaller] Creating '${builder.name}' command ` +
                (guildId ? `in ${guildId}.` : "globaly."),
        )

        await this.bot
            .application!.commands.create(builder, guildId)
            .catch((error) => console.error("Unable to create app command!", builder, error))
    }
}

export interface CommandConfig {
    permissions?: Permissions
    guilds?: string[]
    forceGuild?: boolean
    defer?: "update" | "reply" | "ephemeral_reply"
}

export type CommandBuilder = ContextMenuCommandBuilder | SlashCommandBuilder
export interface Command<
    T extends string | ContextMenuCommandBuilder | SlashCommandBuilder =
        | string
        | ContextMenuCommandBuilder
        | SlashCommandBuilder,
> {
    command?: T
    builder: T
    handler?: (
        interaction: T extends string
            ? ComponentInteraction
            : T extends ContextMenuCommandBuilder
              ? ContextMenuInteraction
              : SlashCommandInteraction,
    ) => Promise<unknown>
    handleComponent?: (interaction: ComponentInteraction) => Promise<unknown>
    handleAutocomplete?: (interaction: AutocompleteInteraction) => Promise<unknown>
    handleModalSubmit?: (interaction: ModalSubmitInteraction) => Promise<unknown>
    mixedHandler?: (interaction: CommandHandlerInteraction) => Promise<unknown>
    config?: CommandConfig
}
