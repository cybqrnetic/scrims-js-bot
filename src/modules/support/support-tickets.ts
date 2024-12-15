import { ButtonBuilder, ButtonStyle, EmbedBuilder, Guild, Role, TextInputStyle } from "discord.js"
import { Base, Component, MessageOptionsBuilder, redis } from "lib"

import { ExchangeHandlerState, ExchangeInputField, RecallExchangeInteraction } from "@module/exchange"
import { TicketCreateHandler, TicketManager, TicketManagerConfig } from "@module/tickets"

import { Colors } from "@Constants"
import { BotMessage } from "@module/messages"
import { PositionRole, Positions } from "@module/positions"

class SupportTicketCreateHandler extends TicketCreateHandler {
    constructor() {
        const tickets = new TicketManager("Support", TICKET_CONFIG)
        super("SupportTicketCreate", "Support Ticket", tickets, SUPPORT_FIELDS)
    }

    /** @override */
    async buildTicketMessages(interaction: RecallExchangeInteraction) {
        return getTicketMessages(
            interaction,
            "Support",
            "Please use this time to fully describe your inquiry, " +
                "as it will help speed this whole process along.",
        )
    }

    /** @overload */
    getModalResponse(interaction: RecallExchangeInteraction, embed: EmbedBuilder) {
        return getExchangeResponse(
            embed,
            "Support",
            "requests",
            Colors.Topaz,
            ":mag:   Once this channel is created, you can describe your issue in more detail.",
        )
    }
}

class ReportTicketCreateHandler extends TicketCreateHandler {
    constructor() {
        const tickets = new TicketManager("Report", TICKET_CONFIG)
        super("ReportTicketCreate", "Report Ticket", tickets, REPORT_FIELDS)
    }

    /** @override */
    async buildTicketMessages(interaction: RecallExchangeInteraction) {
        return getTicketMessages(
            interaction,
            "Report",
            "Please use this time to fully describe the situation and post any evidence that you have.",
        )
    }

    /** @overload */
    getModalResponse(interaction: RecallExchangeInteraction, embed: EmbedBuilder) {
        return getExchangeResponse(
            embed,
            "Report",
            "reports",
            Colors.DullRed,
            ":scroll:   Once this channel is created, you can send us the evidence.",
        )
    }

    /** @override */
    async createTicketChannel(interaction: RecallExchangeInteraction) {
        return this.tickets.createChannel(interaction.member, {
            name: `report-${await redis.incr(`sequence:${this.tickets.type}Ticket`)}`,
        })
    }
}

const COMMON_CLOSE_REASONS = [
    "Problem resolved",
    "Question answered",
    "Your overlay was sent",
    "Your tournament was sent",
    "Your montage was sent",
    "We have handled the situation",
    "This issue is outside of our jurisdiction",
    "Insufficient evidence provided for us to take action",
    "Please create a screenshare request next time",
    "This is not against our rules",
]

const TICKET_CONFIG: TicketManagerConfig = {
    blackListed: Positions.SupportBlacklisted,
    commonCloseReasons: COMMON_CLOSE_REASONS,
    permission: "support.manageTickets",
    transcript: { dmUsers: true },
}

const SUPPORT_FIELDS = [
    ExchangeInputField({
        customId: "reason",
        label: "What can we help you with?",
        style: TextInputStyle.Paragraph,
        minLength: 5,
        maxLength: 50,
        required: true,
        placeholder: "e.g. post tourney, rules question, partnership, ...",
    }),
]

const REPORT_FIELDS = [
    ExchangeInputField("Users", {
        customId: "targets",
        label: "Who are you reporting?",
        style: TextInputStyle.Short,
        minLength: 3,
        maxLength: 1024,
        required: true,
        placeholder: "@username1 @username2 ...",
    }),
    ExchangeInputField({
        customId: "reason",
        label: "Which rule was violated?",
        style: TextInputStyle.Paragraph,
        minLength: 5,
        maxLength: 50,
        required: true,
        placeholder: "e.g. discrimination, Discord TOS violation, ...",
    }),
]

function getExchangeResponse(
    embed: EmbedBuilder,
    name: string,
    category: string,
    color: number,
    notes: string,
) {
    embed.setTitle(`${name} Create Confirmation`)
    embed.setDescription(
        notes +
            `\n:clock1:   The support team will be with you soon after you create this.` +
            `\n:broken_heart:   Joke ${category} could result in punishments.`,
    )
    embed.setColor(color)
    return new MessageOptionsBuilder({ embeds: [embed] })
}

function getTicketMessages(interaction: RecallExchangeInteraction, name: string, comment: string) {
    const supportRole = getSupportRole(interaction.guild as Guild & Base)
    const message = new MessageOptionsBuilder()
        .setContent(
            `${interaction.user} created a ${name.toLowerCase()} ticket. ` +
                getSupportPing(interaction.guild as Guild & Base),
        )
        .addEmbeds(
            new EmbedBuilder()
                .setTitle(`${name} Ticket`)
                .setFields(interaction.state.getEmbedFields())
                .setColor(supportRole instanceof Role ? supportRole.hexColor : Colors.Topaz)
                .setFooter({
                    text: `Handled by the Support Team`,
                    iconURL: (supportRole instanceof Role ? supportRole.iconURL() : null) ?? undefined,
                })
                .setDescription(
                    `👋 **Welcome** ${interaction.user} to your ticket channel. ` +
                        `The ${interaction.guild!.name.toLowerCase()} ${supportRole} team ` +
                        `have been alerted and will be with you shortly. ${comment}`,
                ),
        )
    if (isTestTicket(interaction.state)) message.removeMentions()
    return [message]
}

function getSupportRole(guild: Guild & Base) {
    return PositionRole.getRoles(Positions.Support, guild.id)[0] ?? "Support"
}

const TICKET_OPEN_MENTION = PositionRole.declarePosition("Ticket Open Mention")
function getSupportPing(guild: Guild & Base) {
    return PositionRole.getRoles(TICKET_OPEN_MENTION, guild.id)
}

function isTestTicket(state: ExchangeHandlerState) {
    return ["testing the ticket system", "no ping"].includes(
        state.getFieldInputtedValue("reason")!.toLowerCase(),
    )
}

Component(new SupportTicketCreateHandler().asComponent())
Component(new ReportTicketCreateHandler().asComponent())

BotMessage({
    name: "Support Message",
    permission: "support.messages",
    builder(builder, member) {
        const supportRole = getSupportRole(member.guild as Guild & Base)
        return builder
            .addEmbeds(
                new EmbedBuilder()
                    .setColor(supportRole instanceof Role ? supportRole.hexColor : Colors.Topaz)
                    .setTitle(`${member.guild.name} Support and Report`)
                    .setDescription(`Get in contact with the ${supportRole} team here.`)
                    .addFields(
                        {
                            name: `Support Tickets`,
                            value: `Ask questions, post tournaments, post overlays, etc.`,
                        },
                        {
                            name: `Report Tickets`,
                            value: `Report user(s) for breaking in-game, Discord or Bridge Scrims rules.`,
                        },
                        {
                            name: `IMPORTANT`,
                            value:
                                `If you want us to promote a tournament, overlay or montage **read the pinned messages ` +
                                `in the corresponding promotion channels first**, to see our requirements and guidelines. `,
                        },
                    ),
            )
            .addActions(
                new ButtonBuilder()
                    .setCustomId("SupportTicketCreate")
                    .setLabel("Support")
                    .setEmoji("❤️")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId("ReportTicketCreate")
                    .setLabel("Report")
                    .setEmoji("⚖️")
                    .setStyle(ButtonStyle.Danger),
            )
    },
})
