import {
    BaseInteraction,
    ButtonBuilder,
    ButtonStyle,
    codeBlock,
    EmbedBuilder,
    Guild,
    GuildChannelCreateOptions,
    MessageComponentInteraction,
    Role,
    TextInputStyle,
} from "discord.js"
import { MessageOptionsBuilder, redis } from "lib"

import { Colors } from "@Constants"
import { ExchangeState, TextInput, UserInput } from "@module/forms"
import { BotMessage } from "@module/messages"
import { PositionRole, Positions } from "@module/positions"
import { TicketCreateHandler, TicketManager, TicketManagerConfig } from "@module/tickets"

class SupportTicketCreateHandler extends TicketCreateHandler {
    constructor() {
        const notes = getNotes(
            "requests",
            ":mag:   Once this channel is created, you can describe your issue in more detail.",
        )
        const tickets = new TicketManager("Support", TICKET_CONFIG)
        super("SupportTicketCreate", "Support Ticket", tickets, [[SUPPORT_REASON]], notes, Colors.Topaz)
    }

    /** @override */
    buildTicketMessages(interaction: MessageComponentInteraction<"cached">, state: ExchangeState) {
        return getTicketMessages(
            interaction,
            state,
            this.getResults(interaction, state),
            "Support",
            "Please use this time to fully describe your inquiry, " +
                "as it will help speed this whole process along.",
        )
    }
}

class ReportTicketCreateHandler extends TicketCreateHandler {
    constructor() {
        const notes = getNotes(
            "reports",
            ":scroll:   Once this channel is created, you can send us the evidence.",
        )
        const tickets = new TicketManager("Report", TICKET_CONFIG)
        super("ReportTicketCreate", "Report Ticket", tickets, [REPORT_FIELDS], notes, Colors.DullRed)
    }

    /** @override */
    protected async buildTicketMessages(
        interaction: MessageComponentInteraction<"cached">,
        state: ExchangeState,
    ) {
        return getTicketMessages(
            interaction,
            state,
            this.getResults(interaction, state),
            "Report",
            "Please use this time to fully describe the situation and post any evidence that you have.",
        )
    }

    /** @override */
    protected async createTicketChannel(
        ctx: BaseInteraction<"cached">,
        options: Partial<GuildChannelCreateOptions> = {},
    ) {
        options.name = `report-${await redis.incr(`sequence:${this.tickets.type}Ticket`)}`
        return super.createTicketChannel(ctx, options)
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

const SUPPORT_REASON = TextInput.builder()
    .setId("reason")
    .setLabel("What can we help you with?")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(5)
    .setMaxLength(50)
    .setRequired(true)
    .setPlaceholder("e.g. post tourney, rules question, partnership, ...")
    .build()

const REPORT_FIELDS = [
    UserInput.builder()
        .setId("targets")
        .setLabel("Who are you reporting?")
        .setMin(1)
        .setMax(15)
        .setRequired(true)
        .build(),

    TextInput.builder()
        .setId("reason")
        .setLabel("What rule was violated?")
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(5)
        .setMaxLength(50)
        .setRequired(true)
        .setPlaceholder("e.g. discrimination, Discord TOS violation, ...")
        .build(),
]

function getNotes(category: string, notes: string) {
    return (
        notes +
        `\n:clock1:   The support team will be with you soon after you create this.` +
        `\n:broken_heart:   Joke ${category} could result in punishments.`
    )
}

function getTicketMessages(
    interaction: MessageComponentInteraction<"cached">,
    state: ExchangeState,
    results: { label: string; value?: string }[],
    name: string,
    comment: string,
) {
    const supportRole = getSupportRole(interaction.guild)
    const message = new MessageOptionsBuilder()
        .setContent(
            `${interaction.user} created a ${name.toLowerCase()} ticket. ` +
                getSupportPing(interaction.guild).join(" "),
        )
        .addEmbeds(
            new EmbedBuilder()
                .setTitle(`${name} Ticket`)
                .setFields(results.map((v) => ({ name: v.label, value: v.value ?? codeBlock("") })))
                .setColor(supportRole instanceof Role ? supportRole.hexColor : Colors.Topaz)
                .setFooter({
                    text: `Handled by the Support Team`,
                    iconURL: (supportRole instanceof Role ? supportRole.iconURL() : null) ?? undefined,
                })
                .setDescription(
                    `👋 **Welcome** ${interaction.user} to your ticket channel. ` +
                        `The ${interaction.guild.name.toLowerCase()} ${supportRole} team ` +
                        `have been alerted and will be with you shortly. ${comment}`,
                ),
        )

    if (isTestTicket(state)) message.removeMentions()
    return Promise.resolve([message])
}

function getSupportRole(guild: Guild) {
    return PositionRole.getRoles(Positions.Support, guild.id)[0] ?? "Support"
}

const TICKET_OPEN_MENTION = PositionRole.declarePosition("Ticket Open Mention")
function getSupportPing(guild: Guild) {
    return PositionRole.getRoles(TICKET_OPEN_MENTION, guild.id)
}

const TEST_REASONS = new Set(["testing the ticket system", "no ping"])
function isTestTicket(state: ExchangeState) {
    return TEST_REASONS.has(SUPPORT_REASON.getValue(state)!.toLowerCase())
}

const SUPPORT_TICKET = new SupportTicketCreateHandler().register().getId()
const REPORT_TICKET = new ReportTicketCreateHandler().register().getId()

BotMessage({
    name: "Support Message",
    permission: "support.messages",
    builder(i18n, member) {
        const supportRole = getSupportRole(member.guild)
        return new MessageOptionsBuilder()
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
                    .setCustomId(SUPPORT_TICKET)
                    .setLabel("Support")
                    .setEmoji("❤️")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(REPORT_TICKET)
                    .setLabel("Report")
                    .setEmoji("⚖️")
                    .setStyle(ButtonStyle.Danger),
            )
    },
})
