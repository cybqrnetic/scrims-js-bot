import { Emojis, MAIN_GUILD_ID } from "@Constants"
import { Colors, EmbedBuilder, SlashCommandBuilder, VoiceBasedChannel } from "discord.js"
import { MessageOptionsBuilder, SlashCommand, UserError } from "lib"
import { isQueueCategory } from "./util"

SlashCommand({
    builder: new SlashCommandBuilder().setName("captains").setDescription("Generate two team captains"),
    config: { guilds: [MAIN_GUILD_ID] },
    async handler(interaction) {
        const vc = interaction.member.voice.channel
        if (!vc) {
            throw new UserError("No Voice Channel", "You must be in a voice channel to use this command.")
        }

        if (!vc.parentId || interaction.channel?.parentId !== vc.parentId) {
            throw new UserError("Invalid Channel", "Use this command in the same category as your queue.")
        }

        if (!isQueueCategory(vc.parentId)) {
            throw new UserError("Invalid Channel", "This command can only be used in queue categories.")
        }

        const message = getCaptainsMessage(vc)
        await interaction.reply(message)
    },
})

function getCaptainsMessage(vc: VoiceBasedChannel) {
    const members = [...vc.members.filter((m) => !m.user.bot).values()]
    if (members.length < Math.max(2, vc.userLimit)) {
        throw new UserError("This queue is not full yet.")
    }

    const [captain1, captain2] = members.shuffle()

    return new MessageOptionsBuilder().addEmbeds(
        new EmbedBuilder()
            .setTitle(`${Emojis.loud_sound}  ${vc.name}`)
            .setColor(Colors.Blue)
            .addFields(
                { name: "First Captain", value: `${captain1}`, inline: true },
                { name: "Second Captain", value: `${captain2}`, inline: true },
            ),
    )
}
