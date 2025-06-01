import { MessageFlags, SlashCommandBuilder } from "discord.js"
import { LocalizedError, SlashCommand } from "lib"
import { messages } from "."

const Options = {
    Message: "message",
}

SlashCommand({
    builder: new SlashCommandBuilder()
        .addStringOption((o) =>
            o
                .setLocalizations("commands.send.message_option")
                .setName(Options.Message)
                .setAutocomplete(true)
                .setRequired(true),
        )
        .setLocalizations("commands.send")
        .setDefaultMemberPermissions("0"),

    async handleAutocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase()
        await interaction.respond(
            messages
                .getNames(interaction.member)
                .filter((name) => name.toLowerCase().includes(focused))
                .map((name) => ({ name, value: name }))
                .slice(0, 25),
        )
    },

    async handler(interaction) {
        if (!interaction.channel?.isSendable()) return

        const messageId = interaction.options.getString(Options.Message, true)
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        const message = await messages.get(messageId, interaction.member)
        if (!message) throw new LocalizedError("bot_message_missing", messageId)

        await interaction.channel.send(message)
        await interaction.editReply({ content: "Message was sent." })
    },
})
