import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js"
import { SlashCommand, UserError } from "lib"
import { SubscriptionFeaturePermissions } from "."

SlashCommand({
    builder: new SlashCommandBuilder()
        .setLocalizations("commands.join")
        .addChannelOption((option) =>
            option
                .setLocalizations("commands.join.channel_option")
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(true),
        ),

    config: { defer: "EphemeralReply", permission: SubscriptionFeaturePermissions.JoinFullCalls },

    async handler(interaction) {
        const channel = interaction.options.getChannel<ChannelType.GuildVoice>("channel", true)
        if (!channel.permissionsFor(interaction.member).has(PermissionFlagsBits.Connect)) {
            throw new UserError(
                "Insufficient Permissions",
                "You do not have permission to connect to this channel.",
            )
        }

        if (!interaction.member.voice.channel) {
            throw new UserError("Not In Voice Channel", "Please join a voice channel and try again.")
        }

        await interaction.member.voice.setChannel(channel)
        await interaction.editReply(`Successfully joined ${channel}!`)
    },
})
