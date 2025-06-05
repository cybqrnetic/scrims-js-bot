import {
    bold,
    ButtonStyle,
    Events,
    MessageFlags,
    SlashCommandBuilder,
    SlashCommandRoleOption,
    SlashCommandStringOption,
    type ChatInputCommandInteraction,
    type MessageComponentInteraction,
} from "discord.js"

import { BotListener, LocalizedError, MessageOptionsBuilder, SlashCommand, TextUtil } from "lib"

import { PositionRole } from "@module/positions"

const SubCommands = record({
    status: onStatusSubcommand,
    reload: onReloadSubcommand,
    remove: onRemoveSubcommand,
    add: onAddSubcommand,
})

const Actions = {
    Replace: "REPLACE",
    Join: "JOIN",
}

const Options = {
    Role: "role",
    Position: "position",
}

BotListener(Events.GuildRoleDelete, async (_bot, role) => {
    await PositionRole.deleteMany({ guildId: role.guild.id, roleId: role.id })
})

SlashCommand({
    builder: new SlashCommandBuilder()
        .setLocalizations("commands.position_roles")
        .addSubcommand((sub) => sub.setLocalizations("commands.position_roles.status"))
        .addSubcommand((sub) => sub.setLocalizations("commands.position_roles.reload"))
        .addSubcommand((sub) =>
            sub
                .setLocalizations("commands.position_roles.add")
                .addRoleOption(buildRoleOption())
                .addStringOption(buildPositionOption()),
        )
        .addSubcommand((sub) =>
            sub
                .setLocalizations("commands.position_roles.remove")
                .addRoleOption(buildRoleOption())
                .addStringOption(buildPositionOption().setRequired(false)),
        )
        .setDefaultMemberPermissions("0"),

    async handleAutocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase()
        await interaction.respond(
            Array.from(
                new Set(
                    PositionRole.cache.map((p) => p.position).concat(...PositionRole.declaredPositions()),
                ),
            )
                .filter((v) => v.toLowerCase().includes(focused))
                .sort()
                .slice(0, 25)
                .map((p) => ({ name: p, value: p })),
        )
    },

    async handler(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        await SubCommands[interaction.options.getSubcommand(true)]?.(interaction)
    },

    async handleComponent(interaction) {
        const [roleId, position, action] = interaction.args
        await interaction.update({ content: "Processing...", embeds: [], components: [] })

        const role = interaction.guild.roles.resolve(roleId!)
        if (!role) throw new LocalizedError("type_error.role")

        const positionRole = new PositionRole({
            roleId: role.id,
            position: position,
            guildId: interaction.guildId,
        })

        if (action === Actions.Replace)
            await PositionRole.deleteMany({ roleId: role.id, guildId: interaction.guildId })
        await addPositionRole(interaction, positionRole)
    },
})

function buildRoleOption() {
    return new SlashCommandRoleOption()
        .setLocalizations("commands.position_roles.role_option")
        .setRequired(true)
        .setName(Options.Role)
}

function buildPositionOption() {
    return new SlashCommandStringOption()
        .setLocalizations("commands.position_roles.position_option")
        .setAutocomplete(true)
        .setRequired(true)
        .setName(Options.Position)
}

function getFinishPayload(
    interaction: ChatInputCommandInteraction<"cached"> | MessageComponentInteraction<"cached">,
    content: string | null,
) {
    const positionRoles = PositionRole.cache
        .filter((v) => v.guildId === interaction.guildId && v.role())
        .sort((a, b) => b.role()!.comparePositionTo(a.role()!))

    if (positionRoles.length === 0 && content === null)
        return new LocalizedError("position_roles.none").toMessage(interaction.i18n)

    return new MessageOptionsBuilder()
        .setContent(content)
        .setEphemeral(true)
        .removeMentions()
        .createMultipleEmbeds(positionRoles, (positionRoles) =>
            interaction.i18n
                .getEmbed("position_roles.status")
                .setDescription(
                    positionRoles
                        .map((posRole) => `- ${posRole.role()!} -> ${bold(posRole.position)}`)
                        .join("\n"),
                )
                .setColor(0x673ab7),
        )
}

async function onStatusSubcommand(interaction: ChatInputCommandInteraction<"cached">) {
    await interaction.editReply(getFinishPayload(interaction, null))
}

async function onReloadSubcommand(interaction: ChatInputCommandInteraction<"cached">) {
    await PositionRole.reloadCache()
    await interaction.editReply(
        getFinishPayload(interaction, interaction.i18n.get("position_roles.reloaded")),
    )
}

async function addPositionRole(
    interaction: ChatInputCommandInteraction<"cached"> | MessageComponentInteraction<"cached">,
    positionRole: PositionRole,
) {
    const created = await positionRole.save()
    PositionRole.cache.set(created._id.toString(), created)

    const warning = created.role()!.editable
        ? ``
        : `\n_ _\n ${interaction.i18n.get("role_access_warning", interaction.client.user, created.role()!)}`

    const content = `${interaction.i18n.get(
        "position_roles.connected",
        created.role()!,
        created.position,
    )}. ${warning}`

    await interaction.editReply(getFinishPayload(interaction, content))
}

async function onAddSubcommand(interaction: ChatInputCommandInteraction<"cached">) {
    const role = interaction.options.getRole(Options.Role, true)
    const position = interaction.options.getString(Options.Position, true)

    const existing = await PositionRole.find({ roleId: role.id, guildId: interaction.guildId })
    if (existing.map((v) => v.position).includes(position))
        return interaction.editReply(
            getFinishPayload(interaction, interaction.i18n.get("position_roles.exists", role, position)),
        )

    if (existing.length >= 1) {
        return interaction.editReply(
            new MessageOptionsBuilder()
                .setContent(interaction.i18n.get("position_roles.confirm_add", role, existing[0]!.position))
                .addButtons(
                    (button) =>
                        button
                            .setCustomId(`${interaction.commandName}/${role.id}/${position}/${Actions.Join}`)
                            .setLabel(interaction.i18n.get("operations.add"))
                            .setStyle(ButtonStyle.Success),
                    (button) =>
                        button
                            .setCustomId(
                                `${interaction.commandName}/${role.id}/${position}/${Actions.Replace}`,
                            )
                            .setLabel(interaction.i18n.get("operations.replace"))
                            .setStyle(ButtonStyle.Danger),
                    (button) =>
                        button
                            .setLabel(interaction.i18n.get("operations.cancel"))
                            .setCustomId("CANCEL")
                            .setStyle(ButtonStyle.Secondary),
                ),
        )
    }

    await addPositionRole(
        interaction,
        new PositionRole({ roleId: role.id, position, guildId: interaction.guildId }),
    )
}

async function onRemoveSubcommand(interaction: ChatInputCommandInteraction<"cached">) {
    const role = interaction.options.getRole(Options.Role, true)
    const position = interaction.options.getString(Options.Position)

    const deleted = PositionRole.cache.filter(
        (v) =>
            v.roleId === role.id &&
            v.guildId === interaction.guildId &&
            (!position || v.position === position),
    )

    await PositionRole.deleteMany({ _id: { $in: deleted.map((d) => d._id) } })
    deleted.forEach((v) => PositionRole.cache.delete(v._id.toString()))

    if (!deleted.length) {
        if (position) throw new LocalizedError("position_roles.not_connected_exact", role, position)
        else throw new LocalizedError("position_roles.not_connected_any", role)
    }

    const content = interaction.i18n.get(
        "position_roles.removed",
        role,
        TextUtil.stringifyArray(deleted.map((v) => `**${v.position}**`)),
    )
    await interaction.editReply(getFinishPayload(interaction, content))
}
