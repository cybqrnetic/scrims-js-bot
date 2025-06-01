import { SlashCommandBuilder, roleMention } from "discord.js"
import { SlashCommand, UserError } from "lib"

const Options = {
    Role: "role",
    Text: "text",
}

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("support-ping")
        .setDescription("Can be used by support to ping certain roles.")
        .addStringOption((o) =>
            o
                .setName(Options.Role)
                .setDescription("The role you would like to ping")
                .setChoices(
                    { name: "tourney", value: "780505026266267658" },
                    { name: "nmtourney", value: "911405126005190676" },
                    { name: "overlay", value: "912483717342187541" },
                    { name: "montage", value: "958074901263187998" },
                )
                .setRequired(true),
        )
        .addStringOption((o) =>
            o
                .setName(Options.Text)
                .setDescription("An optional text to add to the message.")
                .setRequired(false),
        ),

    config: { defer: "EphemeralReply", permission: "support.ping", restricted: true },

    async handler(interaction) {
        const roleId = interaction.options.getString(Options.Role, true)
        const text = interaction.options.getString(Options.Text) ?? ""

        if (!interaction.channel?.isSendable()) throw new UserError("Invalid Channel")

        await interaction.channel.send({
            content: `${interaction.user}: ${roleMention(roleId)} ${text}`,
            allowedMentions: { roles: [roleId] },
        })

        await interaction.editReply("Ping sent!")
    },
})
