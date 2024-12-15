import {
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    GuildMember,
    InteractionContextType,
    PermissionsString,
    SlashCommandBuilder,
    SlashCommandStringOption,
    SlashCommandSubcommandBuilder,
    TextChannel,
    User,
    userMention,
    type AutocompleteInteraction,
    type ChatInputCommandInteraction,
    type Interaction,
    type MessageComponentInteraction,
} from "discord.js"

import { LocalizedError, MessageOptionsBuilder, SlashCommand, TimeUtil, UserError } from "lib"

import { Colors } from "../../Constants"
import type { Ticket } from "./Ticket"
import { TicketManager } from "./TicketManager"

const Options = {
    Action: "action",
    Reason: "reason",
    Timeout: "timeout",
    User: "user",
    Role: "role",
    Name: "name",
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const subCommands: Record<string, any> = {
    permissions: onTicketPermissionsCommand,
    closeResponse: onTicketCloseResponse,
    delete: onTicketDeleteCommand,
    rename: onTicketRenameCommand,
    close: onTicketCloseCommand,
}

async function onTicketCommand(interaction: Interaction) {
    const handler = subCommands[interaction.subCommandName || interaction.args.shift()!]
    if (!handler) throw new Error(`Handler not found!`)

    const { ticket, ticketManager } = await TicketManager.findTicket(interaction)

    if (
        !interaction.isButton() &&
        ticketManager.options.permission &&
        !interaction.user.hasPermission(ticketManager.options.permission)
    )
        throw new LocalizedError("tickets.unauthorized_manage", ticket.type)

    await handler(interaction, ticketManager, ticket)
}

const ActionPermissions: Record<string, [boolean, PermissionsString[]]> = {
    added: [true, ["ViewChannel", "SendMessages", "ReadMessageHistory"]],
    removed: [false, ["ViewChannel", "SendMessages", "ReadMessageHistory"]],
    muted: [false, ["SendMessages"]],
    unmuted: [true, ["SendMessages"]],
}

async function onTicketPermissionsCommand(
    interaction: ChatInputCommandInteraction<"cached">,
    ticketManager: TicketManager,
    ticket: Ticket,
) {
    const action = interaction.options.getString(Options.Action, true)
    const [allow, permissions] = ActionPermissions[action]!

    const member = interaction.options.getMember(Options.User) as GuildMember | null
    const role = interaction.options.getRole(Options.Role)

    const channel = interaction.channel as TextChannel
    const target = member ?? role ?? null
    if (!target) throw new LocalizedError("tickets.no_target")

    const targetPosition = member?.roles?.highest?.position ?? role?.position ?? Infinity
    if (interaction.member!.roles.highest.position <= targetPosition)
        throw new LocalizedError("tickets.not_position_level", `${target}`)

    const currentPerms = channel.permissionsFor(target.id, true)
    const hasPermissions = currentPerms && permissions.every((v) => currentPerms.has(v, true))
    const correctState = allow ? hasPermissions : !hasPermissions
    if (correctState) throw new LocalizedError("tickets.permissions_already_correct", `${target}`)
    await channel.permissionOverwrites.edit(
        target.id,
        Object.fromEntries(permissions.map((perm) => [perm, allow])),
    )
    await interaction.reply(
        interaction.i18n
            .getMessageOptions("tickets.permissions_updated", `${interaction.user}`, `${target}`)
            .setAllowedMentions({ parse: ["users"] }),
    )

    if (!member)
        await interaction.followUp(
            interaction.i18n
                .getMessageOptions("tickets.not_pinged_info", `${target}`)
                .setEphemeral(true)
                .setAllowedMentions(),
        )
}

async function onTicketDeleteCommand(
    interaction: ChatInputCommandInteraction | AutocompleteInteraction,
    ticketManager: TicketManager,
    ticket: Ticket,
) {
    if (interaction.isAutocomplete()) {
        return onTicketReasonAutocomplete(interaction, ticketManager, ticket)
    }

    await interaction.deferReply()
    const reason = interaction.options.getString(Options.Reason) ?? undefined
    await ticketManager.closeTicket(ticket.id, interaction.user.id, reason)
}

async function onTicketRenameCommand(
    interaction: ChatInputCommandInteraction,
    ticketManager: TicketManager,
    ticket: Ticket,
) {
    await interaction.deferReply()

    const channel = interaction.channel as TextChannel

    const oldName = channel.name
    const name = interaction.options.getString(Options.Name, true)
    const success = await Promise.race([
        channel.setName(name, `Requested by ${interaction.user.tag}`),
        new Promise((r) => setTimeout(r, 3 * 1000)),
    ]).catch(console.error)

    if (!success)
        throw new UserError(
            "Unable to rename this channel atm (probably bcs of the 2 renames every 10 minutes Discord limit per user).",
        )
    await interaction.editReply(`**Channel renamed** (\`${oldName}\` ➜ \`${name}\`).`)
}

async function onTicketReasonAutocomplete(
    interaction: AutocompleteInteraction,
    ticketManager: TicketManager,
    ticket: Ticket,
) {
    const focused = interaction.options.getFocused()
    await interaction.respond(
        (ticketManager.options.commonCloseReasons ?? [])
            .filter((reason) => reason.toLowerCase().includes(focused.toLowerCase()))
            .slice(0, 25)
            .map((reason) => ({ name: reason, value: reason })),
    )
}

async function onTicketCloseCommand(
    interaction: ChatInputCommandInteraction | AutocompleteInteraction,
    ticketManager: TicketManager,
    ticket: Ticket,
) {
    if (interaction.isAutocomplete()) {
        return onTicketReasonAutocomplete(interaction, ticketManager, ticket)
    }

    const reason = interaction.options.getString(Options.Reason) ?? undefined
    const timeout = interaction.options.getString(Options.Timeout)

    if (ticket.userId === interaction.user.id) {
        // Creator wants to close the ticket, so close it
        await interaction.reply({ content: "Ticket closing..." })
        return ticketManager.closeTicket(ticket.id, interaction.user.id, reason)
    }

    if (timeout) {
        const duration = TimeUtil.parseDuration(timeout)
        if (!duration || duration <= 0 || duration > 30 * 24 * 60 * 60)
            throw new LocalizedError("tickets.invalid_timeout")

        const message = await interaction.reply({
            ...getCloseRequestMessage(ticket, interaction.user, reason, duration),
            fetchReply: true,
        })

        await ticketManager.addCloseTimeout({
            ticketId: ticket.id,
            messageId: message.id,
            closerId: interaction.user.id,
            timestamp: Date.now() + duration * 1000,
            reason,
        })
    } else {
        await interaction.reply(getCloseRequestMessage(ticket, interaction.user, reason))
    }
}

async function onTicketCloseResponse(
    interaction: MessageComponentInteraction<"cached">,
    ticketManager: TicketManager,
    ticket: Ticket,
) {
    const [requesterId, action] = interaction.args
    const requester = await interaction.client.users.fetch(requesterId!).catch(() => null)

    const fields = interaction.message.embeds[0]?.fields
    const reason = fields
        ? fields.find((field) => field.name === "Reason")?.value?.replace(/```/g, "")
        : undefined

    if (
        action === "FORCE" && ticketManager.options.permission
            ? interaction.user.hasPermission(ticketManager.options.permission)
            : interaction.memberPermissions?.has("Administrator")
    ) {
        await interaction.update({ content: "Ticket closing...", embeds: [], components: [] })
        await ticketManager.closeTicket(ticket.id, requester?.id ?? interaction.user.id, reason)
    }

    if (interaction.user.id !== ticket.userId)
        throw new LocalizedError("tickets.creator_only", `${userMention(ticket.userId)}`)

    if (action === "DENY") {
        await interaction.update({
            content: `*Close request from ${userMention(requesterId!)} denied.*`,
            embeds: [],
            components: [],
        })

        ticketManager.cancelCloseTimeouts(interaction.message.id)

        await interaction
            .followUp(
                new MessageOptionsBuilder()
                    .setContent(`${userMention(requesterId!)} your close request was denied.`)
                    .addActions(buildForceCloseAction(requesterId!)),
            )
            .catch(console.error)

        if (interaction.channel?.isSendable()) {
            await interaction.channel
                .send(`${interaction.user} why do you want to keep this open?`)
                .catch(console.error)
        }
    }

    if (action === "ACCEPT") {
        await interaction.update({ content: "Ticket closing...", embeds: [], components: [] })
        await ticketManager.closeTicket(ticket.id, requester?.id, reason)
    }
}

function getCloseRequestMessage(ticket: Ticket, requester: User, reason?: string, timeout?: number) {
    const timeoutText = timeout
        ? ` If you do not respond with ` +
          `**<t:${Math.floor(Date.now() / 1000 + timeout)}:R> this ticket will close anyway**.`
        : ""

    const embed = new EmbedBuilder()
        .setColor(Colors.Discord)
        .setTitle("Can we close this?")
        .setDescription(
            `${requester} would like to close this ticket. Please let us know, if you feel the same way, with the buttons below.${timeoutText}`,
        )
    if (reason) embed.addFields({ name: "Reason", value: `\`\`\`${reason}\`\`\``, inline: false })

    return new MessageOptionsBuilder()
        .setContent(userMention(ticket.userId))
        .addEmbeds(embed)
        .addActions(
            new ButtonBuilder()
                .setCustomId(`ticket/closeResponse/${requester.id}/ACCEPT`)
                .setLabel("Close This")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(`ticket/closeResponse/${requester.id}/DENY`)
                .setLabel("Keep Open")
                .setStyle(ButtonStyle.Secondary),

            buildForceCloseAction(requester.id),
        )
}

function buildForceCloseAction(requesterId: string) {
    return new ButtonBuilder()
        .setCustomId(`ticket/closeResponse/${requesterId}/FORCE`)
        .setLabel("Force Close")
        .setStyle(ButtonStyle.Danger)
}

function buildTicketPermissionsSubcommand() {
    return new SlashCommandSubcommandBuilder()
        .setName("permissions")
        .setDescription("Manage the permissions of a ticket channel with this command.")
        .addStringOption((option) =>
            option
                .setName(Options.Action)
                .setDescription("What would you like to do about the ticket channel permissions?")
                .setRequired(true)
                .addChoices(
                    { name: "Add User/Role", value: "added" },
                    { name: "Remove User/Role", value: "removed" },
                    { name: "Mute User/Role", value: "muted" },
                    { name: "Unmute User/Role", value: "unmuted" },
                ),
        )
        .addUserOption((option) =>
            option
                .setName(Options.User)
                .setDescription("The user you would like to do the action with.")
                .setRequired(false),
        )
        .addRoleOption((option) =>
            option
                .setName(Options.Role)
                .setDescription("The role you would like to do the action with.")
                .setRequired(false),
        )
}

function buildCloseReasonOption() {
    return new SlashCommandStringOption()
        .setName(Options.Reason)
        .setDescription("The reason for this request.")
        .setAutocomplete(true)
        .setRequired(false)
}

function buildTicketCloseSubcommand() {
    return new SlashCommandSubcommandBuilder()
        .setName("close")
        .setDescription("Use this command to request a ticket be deleted.")
        .addStringOption(buildCloseReasonOption())
        .addStringOption((option) =>
            option
                .setName(Options.Timeout)
                .setDescription("Time until this ticket should auto close (e.g. 1d 20hours 3min).")
                .setRequired(false),
        )
}

function buildTicketRenameSubcommand() {
    return new SlashCommandSubcommandBuilder()
        .setName("rename")
        .setDescription("Use this command to rename a ticket channel.")
        .addStringOption((option) =>
            option
                .setName(Options.Name)
                .setDescription("New channel name")
                .setMinLength(1)
                .setMaxLength(16)
                .setRequired(true),
        )
}

function buildTicketDeleteSubcommand() {
    return new SlashCommandSubcommandBuilder()
        .setName("delete")
        .setDescription("Use this command to delete a ticket.")
        .addStringOption(buildCloseReasonOption())
}

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("All commands related to tickets.")
        .addSubcommand(buildTicketPermissionsSubcommand())
        .addSubcommand(buildTicketDeleteSubcommand())
        .addSubcommand(buildTicketCloseSubcommand())
        .addSubcommand(buildTicketRenameSubcommand())
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions("0"),
    mixedHandler: onTicketCommand,
})
