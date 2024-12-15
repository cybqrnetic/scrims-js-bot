import { GuildBasedChannel, InteractionContextType } from "discord.js"
import { LocalizedError, LocalizedSlashCommandBuilder, SlashCommand } from "lib"
import { messages } from "."

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
        .setDefaultMemberPermissions("0")
        .setContexts(InteractionContextType.Guild),

    async handleAutocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase()
        await interaction.respond(
            messages
                .getNames(interaction.member!, interaction.channel as GuildBasedChannel)
                .filter((name) => name.toLowerCase().includes(focused))
                .map((name) => ({ name, value: name }))
                .slice(0, 25),
        )
    },

    async handler(interaction) {
        if (!interaction.channel?.isSendable()) return

        await interaction.deferReply({ ephemeral: true })
        const messageId = interaction.options.getString(Options.Message, true)
        const message = await messages.get(
            messageId,
            interaction.member!,
            interaction.channel as GuildBasedChannel,
        )
        if (!message) throw new LocalizedError("bot_message_missing", messageId)
        await interaction.channel.send(message)
        await interaction.editReply({ content: "The message was sent." })
    },
})
