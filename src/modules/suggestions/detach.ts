import {
    ApplicationCommandType,
    ContextMenuCommandBuilder,
    DiscordAPIError,
    type ContextMenuCommandType,
} from "discord.js"
import { ContextMenu, MessageOptionsBuilder, UserError } from "lib"
import suggestions from "./module"

ContextMenu({
    builder: new ContextMenuCommandBuilder()
        .setType(ApplicationCommandType.Message as ContextMenuCommandType)
        .setLocalizations("commands.suggestions.detach.cm"),

    config: {
        permission: "suggestions.detach",
        defer: "EphemeralReply",
    },

    async handler(interaction) {
        const suggestion = await suggestions.findSuggestionByMessage(interaction.targetId)
        if (!suggestion)
            throw new UserError("Unknown Suggestion", "This can only be used on suggestion messages!")

        if (!suggestion.imageURL)
            throw new UserError("Invalid Operation", "This suggestion doesn't have an image attached to it!")

        const oldURL = suggestion.imageURL
        suggestion.imageURL = undefined

        const message = suggestion.message()
        try {
            await message?.edit(
                new MessageOptionsBuilder().addEmbeds(
                    suggestion.toEmbed().setColor(message.embeds[0]!.color),
                ),
            )
        } catch (error) {
            if (!(error instanceof DiscordAPIError && error.status === 404)) {
                suggestion.imageURL = oldURL
                throw error
            }
        }

        await suggestion.save()
        suggestions.logDetach(suggestion, interaction.user, oldURL)
        await interaction.editReply({ content: "Image removed." })
    },
})
