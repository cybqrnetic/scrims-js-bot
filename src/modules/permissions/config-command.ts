import {
    MessageFlags,
    SlashCommandBuilder,
    SlashCommandRoleOption,
    SlashCommandStringOption,
    inlineCode,
    roleMention,
    userMention,
    type ChatInputCommandInteraction,
} from "discord.js"
import { MessageOptionsBuilder, SlashCommand } from "lib"

import { RolePermissions } from "./RolePermissions"

const SubCommands = {
    Status: "status",
    Add: "add",
    Remove: "remove",
}

const Options = {
    Role: "role",
    Permission: "permission",
}

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("permission-roles")
        .setDescription("Configure the bot permissions given to certain roles.")
        .addSubcommand((sub) =>
            sub.setName(SubCommands.Status).setDescription("View the current configuration."),
        )
        .addSubcommand((sub) =>
            sub
                .setName(SubCommands.Add)
                .setDescription("Grant a bot permission.")
                .addRoleOption(buildRoleOption())
                .addStringOption(buildPermissionOption()),
        )
        .addSubcommand((sub) =>
            sub
                .setName(SubCommands.Remove)
                .setDescription("Revoke a bot permission.")
                .addRoleOption(buildRoleOption())
                .addStringOption(buildPermissionOption()),
        ),

    config: { restricted: true },

    async handler(interaction) {
        switch (interaction.options.getSubcommand(true)) {
            case SubCommands.Add:
                return onAddSubcommand(interaction)
            case SubCommands.Remove:
                return onRemoveSubcommand(interaction)
            case SubCommands.Status:
                return onStatusSubcommand(interaction)
        }
    },
})

function buildRoleOption() {
    return new SlashCommandRoleOption()
        .setName(Options.Role)
        .setDescription("The Discord role.")
        .setRequired(true)
}

function buildPermissionOption() {
    return new SlashCommandStringOption()
        .setName(Options.Permission)
        .setDescription("The bot permission string.")
        .setRequired(true)
}

async function onStatusSubcommand(interaction: ChatInputCommandInteraction<"cached">) {
    const config = RolePermissions.cache.documents().sort((a, b) => {
        const ar = a.role()
        const br = b.role()
        if (!ar) return 1
        if (!br) return -1

        return br.comparePositionTo(ar)
    })

    if (config.length === 0) {
        await interaction.reply({ content: "No permission roles configured.", flags: MessageFlags.Ephemeral })
        return
    }

    const content = config
        .map((v) => {
            const name = v.role() ? roleMention(v.id) : userMention(v.id)
            return `### ${name}\n` + v.permissions.map((v) => `- ${v}`).join("\n")
        })
        .join("\n")

    await interaction.reply(
        new MessageOptionsBuilder()
            .setContent(`## Permission Roles\n${content}`)
            .setEphemeral(true)
            .removeMentions(),
    )
}

async function onAddSubcommand(interaction: ChatInputCommandInteraction<"cached">) {
    const role = interaction.options.getRole(Options.Role, true)
    const permission = interaction.options.getString(Options.Permission, true)

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    await RolePermissions.updateOne(
        { _id: role.id },
        { name: role.name, $addToSet: { permissions: permission } },
        { upsert: true },
    )
    await interaction.editReply(`Added ${inlineCode(permission)}.`)
}

async function onRemoveSubcommand(interaction: ChatInputCommandInteraction<"cached">) {
    const role = interaction.options.getRole(Options.Role, true)
    const permission = interaction.options.getString(Options.Permission, true)

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    await RolePermissions.updateOne({ _id: role.id }, { name: role.name, $pull: { permissions: permission } })
    await interaction.editReply(`Removed ${inlineCode(permission)}.`)
}
