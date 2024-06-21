import { SlashCommandBuilder } from "discord.js"
import { SlashCommand } from "lib"

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Used to test the bots connection")
        .setDefaultMemberPermissions("0"),
    handler: async (interaction) => {
        await interaction.reply({ content: "pong", ephemeral: true })
    },
})
