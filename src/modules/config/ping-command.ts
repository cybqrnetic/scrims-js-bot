import { SlashCommandBuilder } from "discord.js"
import { Command } from "lib"

Command({
    builder: new SlashCommandBuilder().setName("ping").setDescription("Used to test the bots connection"),
    handler: async (interaction) => {
        await interaction.reply({ content: "pong", ephemeral: true })
    },
})
