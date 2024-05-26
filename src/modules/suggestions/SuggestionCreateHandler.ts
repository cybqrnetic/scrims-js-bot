import { EmbedBuilder, TextInputStyle } from "discord.js"
import { CommandHandlerInteraction, Component, MessageOptionsBuilder, Suggestion, TextUtil } from "lib"

import { ExchangeHandler, ExchangeInputField, RecallExchangeInteraction } from "../exchange"
import suggestionsModule from "./module"

const FIELDS = [
    ExchangeInputField({
        customId: "title",
        label: "Title your suggestion",
        style: TextInputStyle.Short,
        minLength: 5,
        maxLength: 100,
        required: true,
        placeholder: "Title here",
    }),
    ExchangeInputField({
        customId: "idea",
        label: "What are you suggesting?",
        style: TextInputStyle.Paragraph,
        minLength: 20,
        maxLength: 1200,
        required: true,
        placeholder: "Explain here",
    }),
    ExchangeInputField({
        customId: "url",
        label: "Optional Image URL",
        style: TextInputStyle.Short,
        required: false,
        minLength: 15,
        placeholder: "https:// ... .png/jpg",
        async parse(interaction, inputted) {
            return TextUtil.isValidHttpUrl(inputted) ? inputted : undefined
        },
    }),
]

class SuggestionsCreateHandler extends ExchangeHandler {
    constructor() {
        super("SuggestionCreate", "Create Suggestion", FIELDS)
    }

    /** @override */
    async verify(interaction: CommandHandlerInteraction) {
        return suggestionsModule.verifyCreate(interaction.user)
    }

    /** @overload */
    getModalResponse(interaction: RecallExchangeInteraction, _: EmbedBuilder) {
        const embed = getSuggestion(interaction).toEmbed()
        return new MessageOptionsBuilder()
            .setContent(
                "***Joke Suggestions that do not include legitimate ideas to improve the server " +
                    "or include anything against our rules will be removed and could result in punishments!***" +
                    "\nWith this in mind, please confirm your suggestion below.",
            )
            .addEmbeds(embed)
    }

    /** @overload */
    async getFinishResponse(interaction: RecallExchangeInteraction) {
        const suggestion = getSuggestion(interaction)
        suggestion.sequence = await Suggestion.find({ channelId: interaction.channelId! })
            .sort({ sequence: -1 })
            .limit(1)
            .exec()
            .then((v) => (v[0]?.sequence ?? 0) + 1)

        const msg = await interaction.channel!.send({ embeds: [suggestion.toEmbed()] })
        await suggestionsModule
            .getInfoMessageFloaters(msg.guildId!)
            .find((v) => v.channelId === interaction.channelId)
            ?.send()
            ?.catch(console.error)

        suggestion.channelId = msg.channelId
        suggestion.messageId = msg.id

        const resp = await suggestion.save().catch((err: Error) => err)
        if (resp instanceof Error) {
            await msg.delete().catch(() => null)
            throw resp
        }

        await suggestionsModule.logCreate(suggestion, msg).catch(console.error)
        await Promise.all(
            suggestionsModule
                .getVoteEmojis(msg.guild!)
                .map((e) =>
                    msg.react(e).catch((e) => console.error(`Failed to react to suggestion msg! (${e})`)),
                ),
        )
        return new MessageOptionsBuilder().setContent("Your suggestion was successfully created.")
    }
}

function getSuggestion(interaction: RecallExchangeInteraction) {
    return new Suggestion({
        creatorId: interaction.user.id,
        guildId: interaction.guildId!,
        imageURL: interaction.state.getFieldValue("url") as string | undefined,
        idea: interaction.state.getFieldInputtedValue("idea"),
        title: interaction.state.getFieldInputtedValue("title"),
    })
}

Component(new SuggestionsCreateHandler().asComponent())
