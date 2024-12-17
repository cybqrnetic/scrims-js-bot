import {
    Attachment,
    AttachmentBuilder,
    AttachmentData,
    Collection,
    EmbedBuilder,
    Guild,
    Message,
    codeBlock,
    time,
    userMention,
    type GuildTextBasedChannel,
} from "discord.js"

import discordTranscripts, { ExportReturnType } from "discord-html-transcripts"
import fs from "fs/promises"
import { DiscordBot, DiscordUtil, TextUtil, request } from "lib"
import path from "path"

import { Colors, Emojis } from "@Constants"
import { Config } from "@module/config"
import type { Ticket } from "./Ticket"

export interface TicketTranscriberOptions {
    dmUsers?: boolean
}

Config.declareTypes(["Attachment Locking Channel"])

export default class TicketTranscriber {
    constructor(protected readonly options: TicketTranscriberOptions = {}) {}

    protected async lockAttachment(attachment: Attachment, guild: Guild, msg?: string) {
        try {
            const file = await request(attachment.proxyURL, { timeout: 5000 }).then((r) => r.arrayBuffer())
            if (file.byteLength / 1000000 > 8) throw new Error(`${file.byteLength / 1000000} MB is too large`)
            const lockedFile = new AttachmentBuilder(Buffer.from(file), attachment as AttachmentData)

            const channelId = Config.getConfigValue("Attachment Locking Channel", guild.id)
            if (!channelId) throw new Error("Channel not configured")
            const channel = await guild.channels.fetch(channelId)
            if (!channel?.isTextBased()) throw new Error("Channel not available")
            const locked = await channel
                .send({ content: msg, files: [lockedFile] })
                .then((m) => m.attachments.first())
            if (!locked) throw new Error("Where did the attachment go?")
            locked.id = attachment.id
            return locked
        } catch (err) {
            throw new Error(`Attachment Locking failed! (${err})`)
        }
    }

    async generateHTMLTranscript(ticket: Ticket, guild: Guild, channel: GuildTextBasedChannel) {
        const messages = await DiscordUtil.completelyFetchMessages(channel.messages).then((v) =>
            v.sort((a, b) => a.createdTimestamp - b.createdTimestamp),
        )

        await this.lockAttachments(messages, guild)
        let transcriptContent = await discordTranscripts.generateFromMessages(messages, channel, {
            returnType: ExportReturnType.String,
            poweredBy: false,
        })

        for (const [name, unicode] of Object.entries(Emojis)) {
            transcriptContent = transcriptContent.replaceAll(`:${name}:`, unicode)
        }

        const file = path.join(".", "transcripts", ticket.id!)
        await fs.writeFile(file, transcriptContent)

        return process.env["NODE_ENV"] === "production"
            ? `https://transcripts.${process.env["DOMAIN"]}/${ticket.id}`
            : path.resolve(file)
    }

    async lockAttachments(messages: Collection<string, Message<true>>, guild: Guild) {
        await Promise.all(
            Array.from(messages.values()).flatMap((m) =>
                m.attachments.map((a) =>
                    this.lockAttachment(a, guild, `\`${a.name}\` **FROM #${m.channel.name}**`)
                        .then((locked) => m.attachments.set(a.id, locked))
                        .catch(console.debugError),
                ),
            ),
        )
    }

    getUserMessageEmbed(ticket: Ticket) {
        const guild = DiscordBot.getInstance().guilds.cache.get(ticket.guildId)
        return new EmbedBuilder()
            .setColor(Colors.ScrimsRed)
            .setTitle(`${ticket.type} Ticket Transcript`)
            .setDescription(
                `Your ${ticket.type.toLowerCase()} ticket from ${time(ticket.createdAt, "f")} was closed. ` +
                    `Click on the link to view the transcript of your ${ticket.type.toLowerCase()} channel. ` +
                    `Have a nice day :cat2:`,
            )
            .addFields(
                ticket.closeReason ? [{ name: "Close Reason", value: codeBlock(ticket.closeReason) }] : [],
            )
            .setFooter(guild ? { text: guild.name, iconURL: guild.iconURL() ?? undefined } : null)
    }

    getLogMessageEmbed(ticket: Ticket) {
        return new EmbedBuilder()
            .setColor(Colors.White)
            .setTitle(`${ticket.type} Ticket Transcript`)
            .setDescription(
                `\`•\` Created by ${userMention(ticket.userId)} ${time(ticket.createdAt, "R")}` +
                    `\n\`•\` Closed by ${ticket.closerId ? userMention(ticket.closerId) : DiscordBot.getInstance().user}` +
                    (ticket.closeReason ? ` (${ticket.closeReason})` : "") +
                    `\n\`•\` Duration: ${TextUtil.stringifyTimeDelta(
                        (Date.now() - ticket.createdAt.valueOf()) / 1000,
                    )}`,
            )
            .setFooter({ text: `ID: ${ticket.id}` })
    }

    async send(guild: Guild, ticket: Ticket, channel: GuildTextBasedChannel) {
        const link = await this.generateHTMLTranscript(ticket, guild, channel)
        if (!link) return

        const channelId = Config.getConfigValue(`${ticket.type} Transcripts Channel`, guild.id)
        if (channelId) {
            const channel = await guild.channels.fetch(channelId).catch(() => null)
            if (channel?.isTextBased())
                await channel
                    ?.send({ content: link, embeds: [this.getLogMessageEmbed(ticket)] })
                    .catch(console.error)
        }

        if (this.options.dmUsers && ticket.userId) {
            const user = await guild.client.users.fetch(ticket.userId).catch(() => null)
            if (user)
                await user
                    .send({ content: link, embeds: [this.getUserMessageEmbed(ticket)] })
                    .catch(() => null)
        }
    }
}
