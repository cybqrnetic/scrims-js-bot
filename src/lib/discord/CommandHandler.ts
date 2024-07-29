import {
    ApplicationCommandOptionChoiceData,
    BaseInteraction,
    BaseMessageOptions,
    AutocompleteInteraction as DefaultAutocompleteInteraction,
    MessageComponentInteraction as DefaultComponentInteraction,
    MessageContextMenuCommandInteraction as DefaultMessageContextMenuCommandInteraction,
    ModalSubmitInteraction as DefaultModalSubmitInteraction,
    ChatInputCommandInteraction as DefaultSlashCommandInteraction,
    UserContextMenuCommandInteraction as DefaultUserContextMenuCommandInteraction,
    DiscordAPIError,
    GuildMember,
    Interaction,
    InteractionType,
    MessageFlags,
    ModalBuilder,
    User,
} from "discord.js"
import { MongoError } from "mongodb"

import { CommandConfig, CommandInstaller } from "./CommandInstaller"

import { I18n } from "../utils/I18n"
import { LocalizedError } from "../utils/LocalizedError"
import { MessageOptionsBuilder } from "../utils/MessageOptionsBuilder"
import { UserError } from "../utils/UserError"
import { Permissions } from "./PermissionsManager"
import type { ScrimsBot } from "./ScrimsBot"

export type CommandHandlerFunction = (i: CommandHandlerInteraction) => Promise<unknown>
export class CommandHandler {
    public readonly handler = (i: Interaction) => this.handleInteraction(i).catch(console.error)
    protected readonly handlers: Record<string, CommandHandlerFunction> = {}

    public constructor(protected readonly installer: CommandInstaller) {}

    protected get bot() {
        return this.installer.bot
    }

    public addHandler(id: string, handler: CommandHandlerFunction) {
        this.handlers[id] = handler
    }

    public getHandler(interaction: Interaction & CommandHandlerInteractionData) {
        const handler = this.handlers[interaction.commandName!]
        if (handler) return handler
        if (interaction.commandName === "CANCEL") throw new LocalizedError("operation_cancelled")
        if (interaction.type === InteractionType.MessageComponent)
            throw new LocalizedError("command_handler.no_host")
        throw new LocalizedError("command_handler.missing_handler")
    }

    protected async handleInteraction(interaction: any) {
        try {
            if (interaction.customId?.startsWith("_")) return

            const config =
                this.installer.getCommandConfig(
                    interaction.commandName || interaction.customId?.split("/")?.[0],
                ) ?? {}

            if (
                interaction.type === InteractionType.MessageComponent ||
                interaction.type === InteractionType.ModalSubmit
            ) {
                interaction.args = interaction.customId.split("/") ?? []
                interaction.commandName = interaction.args.shift() ?? null
                interaction.subCommandName = interaction.args[0] ?? null
            } else {
                interaction.args = []
            }

            if (interaction.options)
                interaction.subCommandName = interaction.options.getSubcommand(false) ?? null

            interaction.path = `${interaction.commandName}`
            if (interaction.subCommandName) interaction.path += `/${interaction.subCommandName}`

            interaction.i18n = I18n.getInstance(interaction.locale)
            interaction.return = (r: InteractionsReturnable) => this.interactionReturn(interaction, r)
            interaction.commandConfig = config

            interaction.userHasPermissions = (permissions: Permissions) =>
                this.bot.permissions.hasPermissions(interaction.user, permissions)

            interaction.userHasPosition = (position: string) =>
                this.bot.permissions.hasPosition(interaction.user, position)

            if (!this.isPermitted(interaction))
                throw new LocalizedError("command_handler.missing_permissions")

            if (config.forceGuild && !interaction.guild)
                throw new LocalizedError("command_handler.guild_only")

            if (interaction.type !== InteractionType.ApplicationCommandAutocomplete) {
                if (config?.defer === "reply") await interaction.deferReply()
                if (config?.defer === "ephemeral_reply") await interaction.deferReply({ ephemeral: true })
                if (config?.defer === "update") await interaction.deferUpdate()
            }

            const handler = this.getHandler(interaction)
            await handler(interaction)
        } catch (error) {
            await this.handleInteractionError(interaction, error)
        }
    }

    protected async handleInteractionError(
        interaction: Interaction & CommandHandlerInteractionData,
        error: unknown,
    ) {
        // Discord 10062 errors mean `Unknown Interaction` which means we can't respond to the interaction anymore
        if (error instanceof DiscordAPIError && [10062].includes(error.code as number)) return

        if (!(error instanceof UserError) && !(error instanceof LocalizedError))
            console.error(
                "Unexpected error while handling a command!",
                {
                    command: interaction.path,
                    type: interaction.type,
                    user: interaction.user.id,
                    channel: interaction.channelId,
                    guild: interaction.guildId,
                },
                error,
            )

        // Give the user that error message they were missing in their life
        if (
            interaction.type !== InteractionType.ApplicationCommandAutocomplete &&
            interaction.i18n &&
            interaction.return
        ) {
            const payload = this.getErrorPayload(interaction.i18n, error)
            await interaction.return(payload).catch(() => null)
        }
    }

    isPermitted(interaction: CommandHandlerInteraction) {
        if (!interaction.commandConfig?.permissions) return true
        return interaction.userHasPermissions(interaction.commandConfig.permissions)
    }

    protected getErrorPayload(i18n: I18n, error: unknown) {
        if (error instanceof MongoError) error = new LocalizedError("unexpected_error.database")
        if (error instanceof DiscordAPIError) error = new LocalizedError("unexpected_error.discord")
        if (error instanceof LocalizedError) return error.toMessagePayload(i18n)
        if (error instanceof UserError) return error.toMessage()
        return new LocalizedError("unexpected_error.unknown").toMessagePayload(i18n)
    }

    protected async interactionReturn(interaction: any, payload: unknown) {
        if (interaction.type === InteractionType.ApplicationCommandAutocomplete && Array.isArray(payload)) {
            await interaction.respond(payload)
        } else if (payload instanceof ModalBuilder) {
            if (interaction.type !== InteractionType.ModalSubmit)
                if (!interaction.replied && !interaction.deferred) await interaction.showModal(payload)
        } else if (typeof payload === "object" && payload !== null) {
            const message = payload as MessageOptionsBuilder
            const responded = interaction.replied || interaction.deferred
            const isEphemeral = interaction.message?.flags?.has(MessageFlags.Ephemeral)
            if (responded && !isEphemeral && message.ephemeral) return interaction.followUp(message)
            if (responded) return interaction.editReply(message)
            if (isEphemeral) return interaction.update(message)
            return interaction.reply(message)
        }
    }
}

export type InteractionsReturnable =
    | BaseMessageOptions
    | MessageOptionsBuilder
    | ModalBuilder
    | ApplicationCommandOptionChoiceData[]

// export type CommandHandlerInteraction = Interaction & CommandHandlerInteractionData

type InteractionWithExtraData<I extends BaseInteraction> = Omit<I, "member"> & CommandHandlerInteractionData
export interface CommandHandlerInteractionData {
    i18n: I18n
    client: ScrimsBot
    user: User
    member: GuildMember
    userHasPosition: (pos: string) => false | undefined | { expiration: () => Promise<Date | undefined> }
    userHasPermissions: (perms: Permissions) => boolean | undefined
    path: string
    args: string[]
    commandName: string | null
    subCommandName: string | null
    commandConfig?: CommandConfig
    return: (payload: InteractionsReturnable) => Promise<void>
}

export type MessageContextMenuInteraction =
    InteractionWithExtraData<DefaultMessageContextMenuCommandInteraction>
export type UserContextMenuInteraction = InteractionWithExtraData<DefaultUserContextMenuCommandInteraction>
export type SlashCommandInteraction = InteractionWithExtraData<DefaultSlashCommandInteraction>
export type ComponentInteraction = InteractionWithExtraData<DefaultComponentInteraction>
export type AutocompleteInteraction = InteractionWithExtraData<DefaultAutocompleteInteraction>
export type ModalSubmitInteraction = InteractionWithExtraData<DefaultModalSubmitInteraction>

export type ContextMenuInteraction = MessageContextMenuInteraction | UserContextMenuInteraction

export type CommandHandlerInteraction =
    | ContextMenuInteraction
    | SlashCommandInteraction
    | ComponentInteraction
    | AutocompleteInteraction
    | ModalSubmitInteraction
