import { ChannelType, InteractionContextType, PermissionFlagsBits } from "discord.js"
import { LocalizedSlashCommandBuilder, SlashCommand, UserError } from "lib"

SlashCommand({
    builder: new LocalizedSlashCommandBuilder()
        .setNameAndDescription("commands.join")
        .addChannelOption((option) =>
            option
                .setNameAndDescription("commands.join.channel_option")
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(true),
        )
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions("0"),
    config: { defer: "ephemeral_reply", permission: "commands.join" },
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
