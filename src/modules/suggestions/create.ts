import { BaseInteraction, MessageComponentInteraction, TextInputStyle, time } from "discord.js"
import { LocalizedError, MessageOptionsBuilder } from "lib"

import { AbstractFormHandler, ExchangeState, TextInput, UrlInput } from "@module/forms"
import { OnlinePositions, Positions } from "@module/positions"
import { Suggestion } from "./Suggestion"
import suggestions from "./module"

const COOLDOWN = 20 * 60 * 1000
const Inputs = {
    Title: TextInput.builder()
        .setId("title")
        .setLabel("Title your suggestion")
        .setStyle(TextInputStyle.Short)
        .setMinLength(5)
        .setMaxLength(100)
        .setRequired(true)
        .setPlaceholder("Title here")
        .build(),

    Idea: TextInput.builder()
        .setId("idea")
        .setLabel("What are you suggesting?")
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(20)
        .setMaxLength(1200)
        .setRequired(true)
        .setPlaceholder("Explain here")
        .build(),

    Image: UrlInput.builder()
        .setId("image")
        .setLabel("Optional Image URL")
        .setRequired(false)
        .setPlaceholder("https:// ... .png/jpg")
        .build(),
}

class SuggestionFormHandler extends AbstractFormHandler {
    constructor() {
        super("CreateSuggestion", "Create Suggestion", [Object.values(Inputs)])
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected onInit(ctx: BaseInteraction<"cached">, state: ExchangeState) {}

    /** @override */
    protected async onVerify(ctx: BaseInteraction<"cached">) {
        const blacklisted = OnlinePositions.hasPosition(ctx.user, Positions.SuggestionsBlacklisted)
        if (blacklisted) {
            throw new LocalizedError("suggestions.blacklisted")
        }

        if (!ctx.user.hasPermission("suggestions.bypassCooldown")) {
            const previous = await Suggestion.findOne({ creatorId: ctx.user.id }).sort({ createdAt: -1 })
            if (previous && previous.createdAt.valueOf() + COOLDOWN > Date.now())
                throw new LocalizedError(
                    "on_cooldown",
                    time(Math.floor((previous.createdAt.valueOf() + COOLDOWN) / 1000), "R"),
                )
        }

        return true
    }

    protected suggestion(ctx: BaseInteraction<"cached">, state: ExchangeState) {
        return new Suggestion({
            creatorId: ctx.user.id,
            guildId: ctx.guildId,
            imageURL: Inputs.Image.getValue(state),
            idea: Inputs.Idea.getValue(state),
            title: Inputs.Title.getValue(state),
        })
    }

    /** @override */
    protected buildMessage(ctx: BaseInteraction<"cached">, state: ExchangeState, index: number) {
        const embed = this.suggestion(ctx, state).toEmbed()
        const warning = !Inputs.Image.isValid(state)
            ? "\n### :warning: The image URL you provided is not a valid URL (should start with https://)."
            : ""

        return new MessageOptionsBuilder()
            .setContent(
                "### :warning: Joke Suggestions that do not include legitimate ideas to improve the server " +
                    "or include anything against our rules will be removed and could result in punishments!" +
                    "\n### :warning: This suggestion is for the Bridge Scrims Discord server." +
                    "\nFor suggestions related to the Minecraft server, " +
                    "please use the Scrims Network Discord: <https://discord.gg/rE3qHxvMNq>" +
                    `${warning}\n### With this in mind, please confirm your suggestion below:`,
            )
            .addEmbeds(embed)
            .addComponents(this.buildActions(ctx.i18n, state, index))
    }

    /** @override */
    protected async onFinish(interaction: MessageComponentInteraction<"cached">, state: ExchangeState) {
        const suggestion = this.suggestion(interaction, state)
        suggestion.sequence = await incrementSequence(interaction)

        const msg = await interaction.channel!.send({ embeds: [suggestion.toEmbed()] })
        suggestions
            .getInfoMessageFloaters(msg.guildId)
            .find((v) => v.channelId === interaction.channelId)
            ?.send()
            ?.catch(console.error)

        suggestions.getVoteEmojis(msg.guild).forEach((e) => msg.react(e).catch(() => null))

        suggestion.channelId = msg.channelId
        suggestion.messageId = msg.id

        try {
            await suggestion.save()
        } catch (error) {
            msg.delete().catch(() => null)
            throw error
        }

        suggestions.logCreate(suggestion).catch(console.error)
        return new MessageOptionsBuilder().setContent("Your suggestion was successfully created.")
    }
}

const sequences: Record<string, { current?: number; promise: Promise<unknown> }> = {}
async function incrementSequence(ctx: BaseInteraction<"cached">) {
    const id = ctx.channelId!
    if (!(id in sequences)) {
        const promise = Suggestion.findOne({ channelId: id })
            .sort({ sequence: -1 })
            .then((v) => (sequences[id]!.current = v?.sequence ?? 0))

        sequences[id] = { promise }
        promise.catch(() => delete sequences[id])
    }

    const value = sequences[id]!
    await value.promise
    return ++value.current!
}

export const CREATE_SUGGESTION = new SuggestionFormHandler().register().getId()
