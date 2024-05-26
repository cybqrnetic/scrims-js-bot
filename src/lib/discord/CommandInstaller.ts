import {
    ApplicationCommand,
    ApplicationCommandData,
    Collection,
    ContextMenuCommandBuilder,
    Events,
    InteractionType,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
    SlashCommandSubcommandsOnlyBuilder,
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

export function SlashCommand(
    command: CommandBase<
        SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder,
        SlashCommandInteraction
    >,
) {
    commands.add(command)
    return command
}

export function ContextMenu(command: ContextMenu) {
    commands.add(command)
    return command
}

export function Component(command: Component) {
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
        const component = typeof builder === "string"
        return async (i) => {
            if (i.type === InteractionType.ApplicationCommandAutocomplete) {
                if (handleAutocomplete) await handleAutocomplete(i)
            } else if (i.type === InteractionType.ModalSubmit) {
                if (handleModalSubmit) await handleModalSubmit(i)
            } else if (i.type === InteractionType.MessageComponent) {
                if (handleComponent) await handleComponent(i)
            }

            if (
                component
                    ? i.type === InteractionType.MessageComponent
                    : i.type === InteractionType.ApplicationCommand
            ) {
                // @ts-expect-error trust me
                if (handler) await handler(i)
            }

            if (mixedHandler) await mixedHandler(i)
        }
    }

    protected installCommand(command: Command) {
        const { builder, config } = command
        if (typeof builder !== "string") {
            // @ts-expect-error important so that we can tell if the command changed or not
            builder.nsfw = false
            // @ts-expect-error important so that we can tell if the command changed or not
            builder.options?.filter((option) => !option.type).forEach((option) => (option.type = 1))

            if (builder.dm_permission === undefined) builder.setDMPermission(!config?.forceGuild)
            if (builder.default_member_permissions === undefined && config?.permissions)
                builder.setDefaultMemberPermissions("0")

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
        return Array.from(this.bot.guilds.cache.map((guild) => guild.id))
    }

    protected shouldInstall(guildId: string | undefined, guilds: string[]) {
        if (process.env.NODE_ENV !== "production") return guildId !== undefined
        return (
            ((!guildId && this.isAllGuilds(guilds)) || (guildId && guilds.includes(guildId))) &&
            !(this.isAllGuilds(guilds) && guildId)
        )
    }

    getCommandJson(builder: CommandBuilder) {
        const json = builder.toJSON()
        if (json.default_member_permissions === undefined) json.default_member_permissions = null
        return json
    }

    async updateAppCommand(appCmd: ApplicationCommand, guildId?: string) {
        const config = this.getCommandConfig(appCmd.name)
        const guilds = this.getGuilds(config)
        const builder = this.getCommandBuilder(appCmd.name)

        // @ts-expect-error important to correctly determine if a command changed or not
        appCmd.options.filter((o) => o.type === 1 && !o.options).map((o) => (o.options = []))
        if (appCmd.dmPermission === null) appCmd.dmPermission = builder?.dm_permission ?? null

        if (appCmd) {
            if (builder && this.shouldInstall(guildId, guilds)) {
                if (!appCmd.equals(builder as ApplicationCommandData)) {
                    console.log(
                        `[CommandInstaller] Updating '${builder.name}' command ` +
                            (guildId ? `in ${guildId}.` : "globally."),
                    )

                    await this.bot
                        .application!.commands.edit(appCmd.id, this.getCommandJson(builder), guildId as any)
                        .catch((error) =>
                            console.error(`Unable to edit app command with id ${appCmd.id}!`, error),
                        )
                }
            } else {
                console.log(
                    `[CommandInstaller] Deleting '${appCmd.name}' command ` +
                        (guildId ? `in ${guildId}.` : "globally."),
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

        if (commands.find((cmd) => cmd.name === builder.name)) return false
        if (!this.shouldInstall(guildId, guilds)) return false

        console.log(
            `[CommandInstaller] Creating '${builder.name}' command ` +
                (guildId ? `in ${guildId}.` : "globaly."),
        )

        await this.bot
            .application!.commands.create(this.getCommandJson(builder), guildId)
            .catch((error) => console.error("Unable to create app command!", builder, error))
    }
}

export interface CommandConfig {
    permissions?: Permissions
    guilds?: string[]
    forceGuild?: boolean
    defer?: "update" | "reply" | "ephemeral_reply"
}

export interface CommandBase<B, I> {
    builder: B
    handler?: (interaction: I) => Promise<unknown>
    handleComponent?: (interaction: ComponentInteraction) => Promise<unknown>
    handleAutocomplete?: (interaction: AutocompleteInteraction) => Promise<unknown>
    handleModalSubmit?: (interaction: ModalSubmitInteraction) => Promise<unknown>
    mixedHandler?: (interaction: CommandHandlerInteraction) => Promise<unknown>
    config?: CommandConfig
}

export type ContextMenu = CommandBase<ContextMenuCommandBuilder, ContextMenuInteraction>
export type SlashCommand = CommandBase<SlashCommandBuilder, SlashCommandInteraction>
export type Component = CommandBase<string, ComponentInteraction>

export type CommandBuilder = ContextMenuCommandBuilder | SlashCommandBuilder
export type Command = ContextMenu | SlashCommand | Component
