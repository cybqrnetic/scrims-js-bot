import {
    ApplicationCommandType,
    ButtonBuilder,
    ButtonStyle,
    time,
    type BaseInteraction,
    type ContextMenuCommandType,
} from "discord.js"

import {
    CommandConfig,
    Component,
    ContextMenu,
    LocalizedContextMenuCommandBuilder,
    MessageOptionsBuilder,
    TextUtil,
    UserError,
} from "lib"

import { Colors } from "@Constants"
import { Suggestion } from "./Suggestion"
import suggestionsModule from "./module"

async function getSuggestions(interaction: BaseInteraction) {
    const suggestions = await Suggestion.find({ creatorId: interaction.user.id })
    return suggestions
        .filter((v) => interaction.client.guilds.cache.has(v.guildId))
        .sort((a, b) => b.createdAt.valueOf() - a.createdAt.valueOf())
}

async function deleteSuggestion(interaction: BaseInteraction, suggestion: Suggestion) {
    // Remove from cache so that when the message delete event arrives it will not trigger anything
    const message = suggestionsModule.suggestionMessage(suggestion)
    if (message) message.channel.messages.cache.delete(suggestion.messageId)

    const rating = message ? suggestionsModule.getMessageRating(message) : "*Unknown Rating*"

    const response = await message?.delete()?.catch((error: Error) => error)
    if (response instanceof Error) {
        // Deleting the message failed so add the message back to cache
        if (message) message.channel.messages.cache.set(message.id, message)
        return
    }

    await suggestion.deleteOne()
    await suggestionsModule.logRemove(suggestion, interaction.user, `${rating}`).catch(console.error)
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

const CM_CONFIG: CommandConfig = {
    permission: "suggestions.delete",
    defer: "ephemeral_reply",
}

ContextMenu({
    builder: new LocalizedContextMenuCommandBuilder()
        .setType(ApplicationCommandType.Message as ContextMenuCommandType)
        .setName("commands.suggestions.detach.cm"),
    config: CM_CONFIG,
    async handler(interaction) {
        const suggestion = await suggestionsModule.findSuggestionByMessage(interaction.targetId)
        if (!suggestion)
            throw new UserError("Unknown Suggestion", "This can only be used on suggestion messages!")
        if (!suggestion.imageURL)
            throw new UserError("Invalid Operation", "This suggestion doesn't have an image attached to it!")

        const oldURL = suggestion.imageURL
        suggestion.imageURL = undefined
        const message = suggestionsModule.suggestionMessage(suggestion)
        if (message?.editable) {
            await message.edit({
                embeds: [suggestion.toEmbed().setColor(message.embeds[0]!.color)],
            })
        }

        await suggestion.save()
        await suggestionsModule.logDetach(suggestion, interaction.user, oldURL).catch(console.error)
        await interaction.editReply({ content: "Image removed." })
    },
})

ContextMenu({
    builder: new LocalizedContextMenuCommandBuilder()
        .setType(ApplicationCommandType.Message as ContextMenuCommandType)
        .setName("commands.suggestions.delete.cm"),
    config: CM_CONFIG,
    async handler(interaction) {
        const suggestion = await suggestionsModule.findSuggestionByMessage(interaction.targetId)
        if (!suggestion)
            throw new UserError("Unknown Suggestion", "This can only be used on suggestion messages!")
        await deleteSuggestion(interaction, suggestion)
    },
})

Component({
    builder: "SuggestionDelete",
    async handler(interaction) {
        const suggestionId = interaction.args.shift()
        if (suggestionId) {
            const suggestion = await suggestionsModule.findSuggestionById(suggestionId)
            if (suggestion) return deleteSuggestion(interaction, suggestion)
        }

        const removable = (await getSuggestions(interaction))
            .filter((suggestion) => !suggestion.epic && suggestion.title)
            .slice(0, 4)
        const channel = suggestionsModule.getInfoMessageFloaters(interaction.guildId!)[0]?.channel

        if (removable.length === 0)
            throw new UserError(
                "No Removable Suggestions",
                `You currently have no removable suggestions. ${
                    channel
                        ? `To create a suggestion, check out ${channel} and click on the **Make a Suggestion** button at the bottom. `
                        : ""
                }*If your suggestion has a lot of up-votes or is very old it may not show up as removable.*`,
            )

        return interaction.reply(
            new MessageOptionsBuilder()
                .setEphemeral(true)
                .addEmbeds((e) =>
                    e
                        .setColor(Colors.RedPink)
                        .setTitle("Remove Suggestion")
                        .setDescription("Please confirm which suggestion you would like to remove.")
                        .addFields(getSuggestionFields(removable)),
                )
                .addButtons(
                    ...removable.map<(b: ButtonBuilder) => ButtonBuilder>(
                        (s, idx) => (b) =>
                            b
                                .setLabel(`${idx + 1}`)
                                .setEmoji("🗑️")
                                .setCustomId(`SuggestionDelete/${s.id}`)
                                .setStyle(ButtonStyle.Danger),
                    ),
                ),
        )
    },
})
