import { Emojis, MAIN_GUILD_ID } from "@Constants"
import {
    ButtonBuilder,
    ButtonStyle,
    Colors,
    EmbedBuilder,
    SlashCommandBuilder,
    VoiceBasedChannel,
} from "discord.js"
import { Component, MessageOptionsBuilder, SlashCommand, UserError } from "lib"

SlashCommand({
    builder: new SlashCommandBuilder().setName("teams").setDescription("Generate two teams playing scrims."),
    config: { guilds: [MAIN_GUILD_ID] },
    async handler(interaction) {
        const vc = interaction.member.voice.channel
        if (!vc) {
            throw new UserError("No Voice Channel", "You must be in a voice channel to use this command.")
        }

        if (!vc.parentId || interaction.channel?.parentId !== vc.parentId) {
            throw new UserError("Invalid Channel", "Use this command in the same category as your queue.")
        }

        const message = getTeamsMessage(vc)
        await interaction.reply(message)
    },
})

Component({
    builder: "REROLL_TEAMS",
    async handler(interaction) {
        const vc = interaction.guild?.channels.cache.get(interaction.args.shift()!) as VoiceBasedChannel

        if (!vc.members.has(interaction.user.id)) {
            throw new UserError("Not in queue", "You are not in the correct queue to do this.")
        }

        const message = getTeamsMessage(vc)
        await interaction.update(message)
    },
})

function getTeamsMessage(vc: VoiceBasedChannel) {
    const members = [...vc.members.filter((m) => !m.user.bot).values()]
    if (members.length < Math.max(2, vc.userLimit)) {
        throw new UserError("This queue is not full yet.")
    }

    members.shuffle()
    const half = Math.ceil(members.length / 2)

    const team1 = members.slice(0, half)
    const team2 = members.slice(half)

    const embed = new EmbedBuilder()
        .setTitle(`${Emojis.loud_sound}  ${vc.name}`)
        .setColor(Colors.Blue)
        .addFields(
            { name: "First Team", value: team1.join("\n"), inline: true },
            { name: "Second Team", value: team2.join("\n"), inline: true },
        )

    return new MessageOptionsBuilder()
        .addEmbeds(embed)
        .addButtons(
            new ButtonBuilder()
                .setLabel("Reroll")
                .setEmoji(Emojis.game_die)
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`REROLL_TEAMS/${vc.id}`),
        )
}
