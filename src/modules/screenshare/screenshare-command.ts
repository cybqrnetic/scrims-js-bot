import { Emojis, MAIN_GUILD_ID } from "@Constants"
import { PositionRole, Positions } from "@module/positions"
import { Ticket, TicketManager } from "@module/tickets"
import {
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    ContainerBuilder,
    inlineCode,
    italic,
    OverwriteType,
    SlashCommandBuilder,
} from "discord.js"
import { MessageOptionsBuilder, redis, ScrimsNetwork, SlashCommand, UserError } from "lib"
import { DateTime } from "luxon"

export const screenshareTicketManager = new TicketManager("Screenshare", {
    closeIfLeave: false,
    permission: "screenshare.manageTickets",
    commonCloseReasons: ["Invalid Screenshare", "No longer needed", "User caught cheating", "User is clean"],
})

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("screenshare")
        .setDescription("Creates a screenshare ticket.")
        .addUserOption((option) =>
            option
                .setName("user")
                .setDescription("The Discord user that should be screenshared.")
                .setRequired(true),
        )
        .addAttachmentOption((option) =>
            option
                .setName("screenshot")
                .setDescription("The screenshot of you telling them not to log")
                .setRequired(true),
        ),

    config: { defer: "EphemeralReply", guilds: [MAIN_GUILD_ID] },

    async handler(interaction) {
        const target = interaction.options.getUser("user", true)
        const screenshot = interaction.options.getAttachment("screenshot", true)

        if (target.bot) throw new UserError("You cannot screenshare a bot.")
        if (target.id === interaction.user.id) throw new UserError("You cannot screenshare yourself.")

        if (!screenshot.contentType?.startsWith("image/")) {
            throw new UserError("Invalid Screenshot", "The provided screenshot must be an image file.")
        }

        const existingTicket = await Ticket.findOne({
            userId: interaction.user.id,
            type: screenshareTicketManager.type,
            deletedAt: { $exists: false },
            extras: { targetId: target.id },
        })

        if (existingTicket) {
            throw new UserError(
                "Ticket Already Exists",
                `You already have an open screenshare ticket for ${target}: <#${existingTicket.channelId}>.`,
            )
        }

        const { ticket, channel } = await createTicket(interaction)

        screenshareTicketManager.addCloseTimeout(
            {
                closerId: interaction.client.user.id,
                messageId: "",
                reason: "No available screensharer.",
                timestamp: DateTime.now().plus({ minutes: 15 }).toJSDate(),
            },
            ticket,
        )

        await interaction.editReply(`Screenshare ticket created: <#${channel.id}>`)
    },
})

async function createTicket(interaction: ChatInputCommandInteraction<"cached">) {
    const targetId = interaction.options.getUser("user", true).id

    const messages = await buildTicketMessages(interaction)

    const channelName = `screenshare-${await redis.incr(`sequence:${screenshareTicketManager.type}Ticket`)}`
    const channel = await screenshareTicketManager.createChannel(interaction.member, {
        name: channelName,
        permissionOverwrites: [
            {
                id: targetId,
                type: OverwriteType.Member,
                allow: screenshareTicketManager.options.creatorPermissions,
            },
        ],
    })

    let ticket: Ticket | undefined
    try {
        ticket = await Ticket.create({
            channelId: channel.id,
            guildId: interaction.guildId,
            userId: interaction.user.id,
            type: screenshareTicketManager.type,
            extras: { targetId: targetId },
        })
        await Promise.all(messages.map((m) => channel.send(m)))
        return { ticket, channel }
    } catch (error) {
        await Promise.all([channel.delete().catch(console.error), ticket?.deleteOne().catch(console.error)])
        throw error
    }
}

async function buildTicketMessages(interaction: ChatInputCommandInteraction<"cached">) {
    const target = interaction.options.getUser("user", true)
    const screenshot = interaction.options.getAttachment("screenshot", true)
    const linkedIgn = await ScrimsNetwork.fetchUsername(target.id).catch(() => undefined)

    const freezeButton = new ButtonBuilder()
        .setLabel("Freeze")
        .setCustomId(`FREEZE/${target.id}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji(Emojis.snowflake)

    const screenshareRoles = PositionRole.getRoles(Positions.Screenshare, interaction.guildId)

    const container = new ContainerBuilder()
        .addTextDisplayComponents((t) =>
            t.setContent(
                `# Screenshare Request\n${interaction.user} Please explain why you suspect ${target} of cheating ` +
                    "as well as any other info you can provide.",
            ),
        )
        .addSeparatorComponents((s) => s.setSpacing(2))
        .addMediaGalleryComponents((g) => g.addItems((i) => i.setURL(screenshot.url)))

    if (linkedIgn) {
        container.addTextDisplayComponents((t) =>
            t.setContent(`-# ${italic("Should")} have the IGN: ${inlineCode(linkedIgn)}`),
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
        .addSeparatorComponents((s) => s.setSpacing(1))
        .addTextDisplayComponents((t) => t.setContent("-# " + screenshareRoles.join("")))
        .setAccentColor(screenshareRoles[0]?.color ?? 0)

    return [new MessageOptionsBuilder().setContainer(container)]
}
