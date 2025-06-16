import { SlashCommandBuilder } from "discord.js"
import { MessageOptionsBuilder, SlashCommand } from "lib"
import { HostPermissions } from "."

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("debug-permissions")
        .setDescription("Debug permissions for the bot")
        .addUserOption((option) =>
            option.setName("user").setDescription("The user to debug permissions for").setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("permission")
                .setDescription("The permission to check")
                .setRequired(true)
                .setAutocomplete(true),
        ),

    config: { restricted: true },

    async handleAutocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase()
        await interaction.respond(
            HostPermissions.getKnownPermissions()
                .filter((v) => v.toLowerCase().includes(focused))
                .sort()
                .slice(0, 25)
                .map((p) => ({ name: p, value: p })),
        )
    },

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
