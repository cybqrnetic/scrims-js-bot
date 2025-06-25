import { Emojis, MAIN_GUILD_ID } from "@Constants"
import { PositionRole, Positions } from "@module/positions"
import { Ticket, TicketManager } from "@module/tickets"
import {
    Attachment,
    ButtonBuilder,
    ButtonStyle,
    channelMention,
    ContainerBuilder,
    GuildMember,
    inlineCode,
    OverwriteType,
    SlashCommandBuilder,
    User,
} from "discord.js"
import { MessageOptionsBuilder, redis, ScrimsNetwork, SlashCommand, UserError } from "lib"
import { DateTime } from "luxon"

export const SS_TICKETS = new TicketManager("Screenshare", {
    closeIfLeave: false,
    permission: "screenshare.manageTickets",
    commonCloseReasons: ["Invalid Screenshare", "Cheating Confirmed", "Insufficient Evidence Found"],
})

const Options = {
    User: "user",
    Ign: "ign",
    Screenshot: "screenshot",
}

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("screenshare")
        .setDescription("Creates a screenshare ticket.")
        .addUserOption((option) =>
            option
                .setName(Options.User)
                .setDescription("The Discord user that should be screenshared.")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName(Options.Ign)
                .setDescription("The ign of the user you want to screenshare.")
                .setRequired(true),
        )
        .addAttachmentOption((option) =>
            option
                .setName(Options.Screenshot)
                .setDescription("The screenshot of you telling them not to log.")
                .setRequired(true),
        ),

    config: { defer: "EphemeralReply", guilds: [MAIN_GUILD_ID] },

    async handler(interaction) {
        const target = interaction.options.getUser(Options.User, true)
        const ign = interaction.options.getString(Options.Ign, true)
        const screenshot = interaction.options.getAttachment(Options.Screenshot, true)

        if (target.bot) throw new UserError("You cannot screenshare a bot.")
        if (target.id === interaction.user.id) throw new UserError("You cannot screenshare yourself.")

        if (!screenshot.contentType?.startsWith("image/")) {
            throw new UserError("Invalid Screenshot", "The provided screenshot must be an image file.")
        }

        const existing = await Ticket.findOne({
            userId: interaction.user.id,
            type: SS_TICKETS.type,
            deletedAt: { $exists: false },
            extras: { targetId: target.id },
        })

        if (existing) {
            throw new UserError(
                "Ticket Already Exists",
                `You already have an open screenshare ticket for ${target}: ${channelMention(existing.channelId)}.`,
            )
        }

        const { ticket, channel } = await createTicket(interaction.member, target, ign, screenshot)
        SS_TICKETS.addCloseTimeout(
            {
                closerId: interaction.client.user.id,
                messageId: target.id,
                reason: "No Available Screensharer",
                timestamp: DateTime.now().plus({ minutes: 15 }).toJSDate(),
            },
            ticket,
        )

        await interaction.editReply(`Screenshare ticket created: ${channel}`)
    },
})

async function createTicket(member: GuildMember, target: User, ign: string, screenshot: Attachment) {
    const message = await buildTicketMessage(member, target, ign, screenshot)

    const channelName = `screenshare-${await redis.incr(`sequence:${SS_TICKETS.type}Ticket`)}`
    const channel = await SS_TICKETS.createChannel(member, {
        name: channelName,
        permissionOverwrites: [
            {
                id: target.id,
                type: OverwriteType.Member,
                allow: SS_TICKETS.options.creatorPermissions,
            },
        ],
    })

    let ticket: Ticket | undefined
    try {
        ticket = await Ticket.create({
            channelId: channel.id,
            guildId: member.guild.id,
            userId: member.id,
            type: SS_TICKETS.type,
            extras: { targetId: target.id },
        })
        await channel.send(message)
        return { ticket, channel }
    } catch (error) {
        await Promise.all([channel.delete().catch(console.error), ticket?.deleteOne().catch(console.error)])
        throw error
    }
}

async function buildTicketMessage(member: GuildMember, target: User, ign: string, screenshot: Attachment) {
    const freezeButton = new ButtonBuilder()
        .setLabel("Freeze")
        .setCustomId(`FREEZE/${target.id}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji(Emojis.snowflake)

    const screenshareRoles = PositionRole.getRoles(Positions.Screenshare, member.guild.id)

    const container = new ContainerBuilder()
        .addTextDisplayComponents((t) =>
            t.setContent(
                `# Screenshare Request\n${member} Please explain why you suspect ${target} of cheating ` +
                    "as well as any other info you can provide.",
            ),
        )
        .addSeparatorComponents((s) => s.setSpacing(2))
        .addMediaGalleryComponents((g) => g.addItems((i) => i.setURL(screenshot.url)))

    container
        .addSeparatorComponents((s) => s.setSpacing(2))
        .addTextDisplayComponents((t) => t.setContent(`${member} reported the IGN: ${inlineCode(ign)}.`))

    const linkedIgn = await ScrimsNetwork.fetchUsername(target.id).catch(() => undefined)
    if (linkedIgn) {
        container.addTextDisplayComponents((t) =>
            t.setContent(`-# ${target} is linked to the IGN: ${inlineCode(linkedIgn)}`),
        )
    } else {
        container.addTextDisplayComponents((t) =>
            t.setContent(`-# ${target} doesn't have a linked Minecraft account.`),
        )
    }

    container
        .addSeparatorComponents((s) => s.setSpacing(2))
        .addSectionComponents((s) =>
            s
                .addTextDisplayComponents((t) =>
                    t.setContent(
                        `If ${target} is not frozen by us within the next 15 minutes, ` +
                            "this will automatically get deleted and they are safe to logout.",
                    ),
                )
                .setButtonAccessory(freezeButton),
        )

    if (screenshareRoles.length > 0) {
        container
            .addSeparatorComponents((s) => s.setSpacing(1))
            .addTextDisplayComponents((t) => t.setContent("-# " + screenshareRoles.join("")))
            .setAccentColor(screenshareRoles[0]!.color)
    }

    return new MessageOptionsBuilder().setContainer(container)
}
