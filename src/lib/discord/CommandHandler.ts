import {
    ApplicationCommandOptionChoiceData,
    BaseMessageOptions,
    BitField,
    DiscordAPIError,
    Interaction,
    MessageFlags,
    ModalBuilder,
    type BaseInteraction,
} from "discord.js"

import { ErrorReply } from "@redis/client"
import { MongoError } from "mongodb"

import { MAIN_GUILD_ID } from "."
import { I18n } from "../utils/I18n"
import { LocalizedError } from "../utils/LocalizedError"
import { MessageOptionsBuilder } from "../utils/MessageOptionsBuilder"
import { UserError } from "../utils/UserError"
import { CommandConfig } from "./CommandInstaller"

const IGNORE_CODES = new Set(["10062", "10008", "10003"])

export class CommandHandler {
    private readonly handlers: Record<string, Handler> = {}

    public addHandler(id: string, handler: Handler) {
        this.handlers[id] = handler
    }

    public async handleInteraction(interaction: Interaction) {
        try {
            if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
                if (interaction.customId.startsWith("_")) return

                interaction.args = interaction.customId.split("/") ?? []
                const name = interaction.args.shift()!.split("~")
                interaction.commandName = name[0]!
                interaction.subCommandName = name[1] ?? null
            } else {
                interaction.args = []
                interaction.subCommandName =
                    interaction.isChatInputCommand() || interaction.isAutocomplete()
                        ? interaction.options.getSubcommand(false)
                        : null
            }

            const { callback, config } = this.handlers[interaction.commandName] ?? {}

            interaction.path = interaction.commandName
            if (interaction.subCommandName) interaction.path += `~${interaction.subCommandName}`

            interaction.i18n = I18n.getInstance(interaction.locale)
            interaction.return = (r: InteractionsReturnable) => this.interactionReturn(interaction, r)
            interaction.commandConfig = config

            if (interaction.commandName === "CANCEL" && !callback)
                throw new LocalizedError("operation_cancelled")

            if (config?.restricted && interaction.guildId !== MAIN_GUILD_ID)
                throw new LocalizedError("command_handler.missing_permissions")

            if (config?.permission && !interaction.user.hasPermission(config.permission))
                throw new LocalizedError("command_handler.missing_permissions")

            if (!interaction.isAutocomplete()) {
                if (config?.defer === "Reply") await interaction.deferReply()
                if (config?.defer === "EphemeralReply")
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
                if (config?.defer === "Update" && !interaction.isCommand()) await interaction.deferUpdate()
            }

            await callback?.(interaction)
        } catch (error) {
            await this.handleInteractionError(interaction, error)
        }
    }

    protected async handleInteractionError(interaction: BaseInteraction, error: unknown) {
        if (error instanceof DiscordAPIError && IGNORE_CODES.has(error.code.toString())) return

        if (!(error instanceof UserError) && !(error instanceof LocalizedError)) {
            console.error("Unexpected error while handling a command!", {
                command: interaction.path,
                customId: interaction.customId,
                type: interaction.type,
                user: interaction.user.id,
                channel: interaction.channelId,
                guild: interaction.guildId,
            })
            console.error(error)
        }

        // Give the user that error message they were missing in their life
        if (!interaction.isAutocomplete() && interaction.i18n && interaction.return) {
            const payload = this.getErrorPayload(interaction.i18n, error)
            await interaction.return(payload).catch(() => null)
        }
    }

    protected getErrorPayload(i18n: I18n, error: unknown) {
        if (error instanceof LocalizedError) return error.toMessage(i18n)
        if (error instanceof UserError) return error.toMessage()

        if (error instanceof DiscordAPIError)
            return new LocalizedError("unexpected_error.discord").toMessage(i18n)

        if (error instanceof MongoError || error instanceof ErrorReply)
            return new LocalizedError("unexpected_error.database").toMessage(i18n)

        return new LocalizedError("unexpected_error.unknown").toMessage(i18n)
    }

    protected async interactionReturn(interaction: Interaction, payload: unknown) {
        if (interaction.isAutocomplete()) {
            if (Array.isArray(payload)) await interaction.respond(payload)
        } else if (payload instanceof ModalBuilder) {
            if (!interaction.isModalSubmit() && !interaction.replied && !interaction.deferred)
                await interaction.showModal(payload)
        } else if (typeof payload === "object" && payload !== null) {
            const message = payload as MessageOptionsBuilder
            const replied = interaction.replied || interaction.deferred
            const responseEphemeral = message.flags && new BitField(message.flags).has(MessageFlags.Ephemeral)
            const repliedEphemeral =
                !interaction.isCommand() && interaction.message?.flags?.has(MessageFlags.Ephemeral)

            if (replied && !repliedEphemeral && responseEphemeral) return interaction.followUp(message)
            if (replied) return interaction.editReply(message)
            if (repliedEphemeral) return interaction.update(message)
            return interaction.reply(message)
        }
    }
}

interface Handler {
    callback: (i: Interaction) => Promise<unknown>
    config?: CommandConfig
}

export type InteractionsReturnable =
    | BaseMessageOptions
    | MessageOptionsBuilder
    | ModalBuilder
    | ApplicationCommandOptionChoiceData[]

declare module "discord.js" {
    interface BaseInteraction {
        i18n: I18n
        user: User
        path: string
        args: string[]
        customId?: string
        commandName: string
        subCommandName: string | null
        commandConfig?: CommandConfig
        return: (payload: InteractionsReturnable) => Promise<InteractionResponse | Message | void>
    }

    interface ModalSubmitInteraction<Cached> {
        update(
            options: string | MessagePayload | InteractionUpdateOptions,
        ): Promise<InteractionResponse<BooleanCache<Cached>>>
    }
}
