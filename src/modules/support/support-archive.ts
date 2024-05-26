import { Positions } from "@Constants"
import { ExportReturnType, createTranscript } from "discord-html-transcripts"
import { SlashCommandBuilder, channelMention } from "discord.js"
import { writeFile } from "fs/promises"
import { SlashCommand, SlashCommandInteraction, UserError } from "lib"
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
        )
        .setDMPermission(false)
        .setDefaultMemberPermissions("0"),
    config: { defer: "ephemeral_reply", permissions: { positionLevel: Positions.Staff } },
    handler: onArchiveCommand,
})

async function onArchiveCommand(interaction: SlashCommandInteraction) {
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

    await writeFile(path.join(".", "transcripts", filename), transcriptContent)

    const link = encodeURI(
        process.env.NODE_ENV === "production"
            ? `https://transcripts.${process.env.DOMAIN}/${filename}`
            : `${path.resolve(".", "transcripts", filename)}`,
    )

    const message = {
        content: `Successfully archived ${channelMention(channel.id)}!\n[Link to transcript](${link})`,
    }

    interaction.user.send(message).catch(() => undefined)
    await interaction.editReply(message)
}
