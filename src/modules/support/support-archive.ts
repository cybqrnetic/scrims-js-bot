import { ExportReturnType, createTranscript } from "discord-html-transcripts"
import { SlashCommandBuilder, channelMention } from "discord.js"
import { SlashCommand, UserError } from "lib"
import { DateTime } from "luxon"
import path from "path"

const Options = {
    Channel: "channel",
    Limit: "limit",
}

const DEFAULT_LIMIT = 200

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("support-archive")
        .setDescription("Save messages from a specific channel.")
        .addChannelOption((o) =>
            o
                .setName(Options.Channel)
                .setDescription("The channel to archive messages from. Default is current channel.")
                .setRequired(false),
        )
        .addIntegerOption((o) =>
            o
                .setName(Options.Limit)
                .setDescription(`The maximum number of messages to archive. Default is ${DEFAULT_LIMIT}.`)
                .setRequired(false),
        ),

    config: { defer: "ephemeral_reply", permission: "commands.archive" },

    async handler(interaction) {
        const channel = interaction.options.getChannel(Options.Channel) ?? interaction.channel
        const limit = interaction.options.getInteger(Options.Limit) ?? DEFAULT_LIMIT

        if (channel == null || !("messages" in channel) || !("name" in channel) || !channel.isTextBased()) {
            throw new UserError("Invalid channel!")
        }

        const transcriptContent = await createTranscript(channel, {
            poweredBy: false,
            saveImages: true,
            returnType: ExportReturnType.Buffer,
            limit: limit,
        })

        const datetime = DateTime.fromMillis(interaction.createdTimestamp)
        const filename = `${channel.name}-${datetime.toFormat("yyyyMMddHHmmss")}`

        const file = path.join(".", "transcripts", filename)
        await Bun.write(file, transcriptContent)

        const link =
            process.env.NODE_ENV === "production"
                ? `https://transcripts.${process.env["DOMAIN"]}/${encodeURIComponent(filename)}`
                : path.resolve(file)

        const message = {
            content: `Successfully archived ${channelMention(channel.id)}!\n[Link to transcript](${link})`,
        }

        interaction.user.send(message).catch(() => undefined)
        await interaction.editReply(message)
    },
})
