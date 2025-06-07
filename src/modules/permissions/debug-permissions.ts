import { SlashCommandBuilder } from "discord.js"
import { MessageOptionsBuilder, SlashCommand } from "lib"

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("debug-permissions")
        .setDescription("Debug permissions for the bot")
        .addUserOption((option) =>
            option.setName("user").setDescription("The user to debug permissions for").setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("permission").setDescription("The permission to check").setRequired(true),
        ),

    config: { restricted: true },

    async handler(interaction) {
        const user = interaction.options.getUser("user", true)
        const permission = interaction.options.getString("permission", true)

        await interaction.reply(
            new MessageOptionsBuilder()
                .setContent(user.hasPermission(permission) ? "True" : "False")
                .setEphemeral(true),
        )
    },
})
