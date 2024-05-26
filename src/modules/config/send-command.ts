import { Positions } from "@Constants"
import { LocalizedError, LocalizedSlashCommandBuilder, SlashCommand } from "lib"

const Options = {
    Message: "message",
}

SlashCommand({
    builder: new LocalizedSlashCommandBuilder()
        .addStringOption((o) =>
            o
                .setNameAndDescription("commands.send.message_option")
                .setName(Options.Message)
                .setAutocomplete(true)
                .setRequired(true),
        )
        .setNameAndDescription("commands.send")
        .setDMPermission(false)
        .setDefaultMemberPermissions("0"),

    config: { permissions: { positionLevel: Positions.Staff } },

    async handleAutocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase()
        await interaction.respond(
            interaction.client.messages
                .getNames(interaction.member!)
                .filter((name) => name.toLowerCase().includes(focused))
                .map((name) => ({ name, value: name }))
                .slice(0, 25),
        )
    },

    async handler(interaction) {
        await interaction.deferReply({ ephemeral: true })
        const messageId = interaction.options.getString(Options.Message, true)
        const message = await interaction.client.messages.get(messageId, interaction.member!)
        if (!message) throw new LocalizedError("bot_message_missing", messageId)
        await interaction.channel?.send(message)
        await interaction.editReply({ content: "The message was sent." })
    },
})
