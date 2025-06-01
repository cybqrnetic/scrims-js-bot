import {
    ApplicationCommandType,
    ButtonBuilder,
    ButtonStyle,
    ContextMenuCommandBuilder,
    DiscordAPIError,
    time,
    type BaseInteraction,
    type ContextMenuCommandType,
} from "discord.js"

import { Component, ContextMenu, MessageOptionsBuilder, TextUtil, UserError } from "lib"

import { Colors } from "@Constants"
import { Suggestion } from "./Suggestion"
import suggestions from "./module"

export const DELETE_SUGGESTION = "DeleteSuggestion"

Component({
    builder: DELETE_SUGGESTION,
    async handler(interaction) {
        const suggestionId = interaction.args.shift()
        if (suggestionId) {
            const suggestion = await Suggestion.findOne({ _id: suggestionId })
            if (suggestion) return deleteSuggestion(interaction, suggestion)
        }

        const channel = suggestions.getInfoMessageFloaters(interaction.guildId)[0]?.channel ?? ""
        const removable = (await getSuggestions(interaction))
            .filter((suggestion) => !suggestion.epic && suggestion.title)
            .slice(0, 4)

        if (removable.length === 0)
            throw new UserError(
                "No Removable Suggestions",
                `You currently have no removable suggestions. ` +
                    (channel &&
                        `To create a suggestion, check out ${channel} and click on the **Make a Suggestion** button at the bottom. `) +
                    `*If your suggestion has a lot of up-votes or is very old it may not show up as removable.*`,
            )

        await interaction.reply(
            new MessageOptionsBuilder()
                .setEphemeral(true)
                .addEmbeds((embed) =>
                    embed
                        .setColor(Colors.RedPink)
                        .setTitle("Remove Suggestion")
                        .setDescription("Please confirm which suggestion you would like to remove.")
                        .addFields(getSuggestionFields(removable)),
                )
                .addButtons(
                    ...removable.map((s, idx) =>
                        new ButtonBuilder()
                            .setLabel(`${idx + 1}`)
                            .setEmoji("🗑️")
                            .setCustomId(`${DELETE_SUGGESTION}/${s.id}`)
                            .setStyle(ButtonStyle.Danger),
                    ),
                ),
        )
    },
})

ContextMenu({
    builder: new ContextMenuCommandBuilder()
        .setType(ApplicationCommandType.Message as ContextMenuCommandType)
        .setLocalizations("commands.suggestions.delete.cm"),

    config: {
        permission: "suggestions.delete",
        defer: "EphemeralReply",
    },

    async handler(interaction) {
        const suggestion = await suggestions.findSuggestionByMessage(interaction.targetId)
        if (!suggestion)
            throw new UserError("Unknown Suggestion", "This can only be used on suggestion messages!")

        await deleteSuggestion(interaction, suggestion)
    },
})

async function getSuggestions(interaction: BaseInteraction) {
    const suggestions = await Suggestion.find({ creatorId: interaction.user.id })
    return suggestions
        .filter((v) => interaction.client.guilds.cache.has(v.guildId))
        .sort((a, b) => b.createdAt.valueOf() - a.createdAt.valueOf())
}

async function deleteSuggestion(interaction: BaseInteraction, suggestion: Suggestion) {
    const message = suggestion.message()
    const rating = message ? suggestions.getMessageRating(message) : "Unknown Rating"
    if (message) {
        suggestions.messageSuggestions.set(message.id, null)
        try {
            await message.delete()
        } catch (error) {
            if (!(error instanceof DiscordAPIError && error.status === 404)) {
                suggestions.messageSuggestions.set(message.id, suggestion)
                throw error
            }
        }
    }

    await suggestion.deleteOne()
    suggestions.logRemove(suggestion, interaction.user, rating.toString())
    await interaction.return(
        new MessageOptionsBuilder().setContent("Suggestion successfully removed.").setEphemeral(true),
    )
}

function getSuggestionFields(suggestions: Suggestion[]) {
    return suggestions.map((suggestion, idx) => {
        const suggestionInfo = `**Created ${time(suggestion.createdAt, "R")}:**`
        const suggestionText = TextUtil.limitText(suggestion.idea, 1024 - suggestionInfo.length - 6, "\n...")
        return {
            name: `${idx + 1}. ${suggestion.title}`,
            value: `${suggestionInfo}\`\`\`${suggestionText}\`\`\``,
            inline: false,
        }
    })
}
