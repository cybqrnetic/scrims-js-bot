import {
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
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
    type MessageComponentInteraction,
} from "discord.js"

import { LocalizedError, MessageOptionsBuilder, SlashCommand, TimeUtil, UserError } from "lib"

import { Colors } from "@Constants"
import { Ticket } from "./Ticket"
import { TicketManager } from "./TicketManager"

const Options = {
    Action: "action",
    Reason: "reason",
    Timeout: "timeout",
    User: "user",
    Role: "role",
    Name: "name",
}

const subHandlers = {
    permissions: onTicketPermissionsCommand,
    delete: onTicketDeleteCommand,
    rename: onTicketRenameCommand,
    close: onTicketCloseCommand,
}

const componentHandlers = {
    CLOSE: onTicketCloseResponse,
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

    subHandlers,
    componentHandlers,
    handleAutocomplete,
})

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

const ActionPermissions = record<[boolean, PermissionsString[]]>({
    added: [true, ["ViewChannel", "SendMessages", "ReadMessageHistory"]],
    removed: [false, ["ViewChannel", "SendMessages", "ReadMessageHistory"]],
    muted: [false, ["SendMessages"]],
    unmuted: [true, ["SendMessages"]],
})

async function onTicketPermissionsCommand(interaction: ChatInputCommandInteraction<"cached">) {
    await TicketManager.findTicket(interaction, true)

    const action = interaction.options.getString(Options.Action, true)
    const [allow, permissions] = ActionPermissions[action]!

    const member = interaction.options.getMember(Options.User)
    const role = interaction.options.getRole(Options.Role)

    const channel = interaction.channel as TextChannel
    const target = member ?? role ?? null
    if (!target) throw new LocalizedError("tickets.no_target")

    const targetPosition = member?.roles?.highest?.position ?? role?.position ?? Infinity
    if (interaction.member.roles.highest.position <= targetPosition)
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

async function onTicketDeleteCommand(interaction: ChatInputCommandInteraction<"cached">) {
    const { ticket, manager } = await TicketManager.findTicket(interaction, true)
    const reason = interaction.options.getString(Options.Reason) ?? undefined
    await manager.closeTicket(ticket._id, interaction.user.id, reason)
}

async function onTicketRenameCommand(interaction: ChatInputCommandInteraction<"cached">) {
    await TicketManager.findTicket(interaction, true)
    await interaction.deferReply()

    const channel = interaction.channel as TextChannel
    const oldName = channel.name
    const name = interaction.options.getString(Options.Name, true)
    const success = await Promise.race([
        channel.setName(name, `Requested by ${interaction.user.tag}`),
        sleep(3000),
    ])

    if (!success)
        throw new UserError("We are on cooldown from updating this channel's name. Please try again later.")

    await interaction.editReply(`**Channel renamed** (\`${oldName}\` ➜ \`${name}\`).`)
}

async function handleAutocomplete(interaction: AutocompleteInteraction<"cached">) {
    const { manager } = await TicketManager.findTicket(interaction, true)
    const focused = interaction.options.getFocused()
    await interaction.respond(
        (manager.options.commonCloseReasons ?? [])
            .filter((reason) => reason.toLowerCase().includes(focused.toLowerCase()))
            .slice(0, 25)
            .map((reason) => ({ name: reason, value: reason })),
    )
}

async function onTicketCloseCommand(interaction: ChatInputCommandInteraction<"cached">) {
    const { ticket, manager } = await TicketManager.findTicket(interaction, true)

    const reason = interaction.options.getString(Options.Reason) ?? undefined
    const timeout = interaction.options.getString(Options.Timeout)

    if (ticket.userId === interaction.user.id) {
        // Creator wants to close the ticket, so close it
        await interaction.reply({ content: "Ticket closing..." })
        return manager.closeTicket(ticket._id, interaction.user.id, reason)
    }

    if (timeout) {
        const duration = TimeUtil.parseDuration(timeout)
        if (!duration || duration <= 0 || duration > 30 * 24 * 60 * 60)
            throw new LocalizedError("tickets.invalid_timeout")

        const message = await interaction.reply({
            ...getCloseRequestMessage(ticket, interaction.user, reason, duration),
            fetchReply: true,
        })

        void manager.addCloseTimeout(
            {
                messageId: message.id,
                closerId: interaction.user.id,
                timestamp: new Date(Date.now() + duration * 1000),
                reason,
            },
            ticket,
        )
    } else {
        await interaction.reply(getCloseRequestMessage(ticket, interaction.user, reason))
    }
}

async function onTicketCloseResponse(interaction: MessageComponentInteraction<"cached">) {
    const [requesterId, action] = interaction.args
    const requester = await interaction.client.users.fetch(requesterId!).catch(() => null)

    const reason = interaction.message.embeds[0]?.fields
        .find((field) => field.name === "Reason")
        ?.value.slice(3, -3)
        .trim()

    if (action === "FORCE") {
        const { ticket, manager } = await TicketManager.findTicket(interaction, true)
        await interaction.update({ content: "Ticket closing...", embeds: [], components: [] })
        await manager.closeTicket(ticket._id, requester?.id ?? interaction.user.id, reason)
        return
    }

    const { ticket, manager } = await TicketManager.findTicket(interaction, false)
    if (interaction.user.id !== ticket.userId)
        throw new LocalizedError("tickets.creator_only", `${userMention(ticket.userId)}`)

    if (action === "DENY") {
        await interaction.update({
            content: `*Close request from ${userMention(requesterId!)} denied.*`,
            embeds: [],
            components: [],
        })

        void manager.cancelCloseTimeouts(interaction.message.id)

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
    } else if (action === "ACCEPT") {
        await interaction.update({ content: "Ticket closing...", embeds: [], components: [] })
        await manager.closeTicket(ticket._id, requester?.id, reason)
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
                .setCustomId(`ticket/CLOSE/${requester.id}/ACCEPT`)
                .setLabel("Close This")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(`ticket/CLOSE/${requester.id}/DENY`)
                .setLabel("Keep Open")
                .setStyle(ButtonStyle.Secondary),

            buildForceCloseAction(requester.id),
        )
}

function buildForceCloseAction(requesterId: string) {
    return new ButtonBuilder()
        .setCustomId(`ticket/CLOSE/${requesterId}/FORCE`)
        .setLabel("Force Close")
        .setStyle(ButtonStyle.Danger)
}
