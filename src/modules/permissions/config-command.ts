import {
    GuildMember,
    MessageFlags,
    Role,
    SlashCommandBuilder,
    SlashCommandMentionableOption,
    SlashCommandStringOption,
    User,
    inlineCode,
    roleMention,
    userMention,
    type ChatInputCommandInteraction,
} from "discord.js"
import { MessageOptionsBuilder, SlashCommand } from "lib"

import { HostPermissions, RolePermissions } from "."

const SubCommands = {
    Status: "status",
    Add: "add",
    Remove: "remove",
}

const Options = {
    Target: "target",
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
                .addMentionableOption(buildTargetOption())
                .addStringOption(buildPermissionOption()),
        )
        .addSubcommand((sub) =>
            sub
                .setName(SubCommands.Remove)
                .setDescription("Revoke a bot permission.")
                .addMentionableOption(buildTargetOption())
                .addStringOption(buildPermissionOption()),
        ),

    config: { restricted: true },

    async handleAutocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase()
        await interaction.respond(
            Array.from(
                new Set([
                    ...RolePermissions.cache.map((p) => p.permissions).flat(),
                    ...HostPermissions.declaredPermissions,
                ]),
            )
                .filter((v) => v.toLowerCase().includes(focused))
                .sort()
                .slice(0, 25)
                .map((p) => ({ name: p, value: p })),
        )
    },

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

function buildTargetOption() {
    return new SlashCommandMentionableOption()
        .setName(Options.Target)
        .setDescription("The Discord user or role.")
        .setRequired(true)
}

function buildPermissionOption() {
    return new SlashCommandStringOption()
        .setName(Options.Permission)
        .setDescription("The bot permission string.")
        .setRequired(true)
        .setAutocomplete(true)
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
            .setContainerContent(`## Permission Roles\n${content}`)
            .setEphemeral(true)
            .removeMentions(),
    )
}

async function onAddSubcommand(interaction: ChatInputCommandInteraction<"cached">) {
    const target = interaction.options.getMentionable(Options.Target, true)
    const permission = interaction.options.getString(Options.Permission, true)

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    await RolePermissions.updateOne(
        { _id: target.id },
        { name: getName(target), $addToSet: { permissions: permission } },
        { upsert: true },
    )
    await interaction.editReply(`Added ${inlineCode(permission)}.`)
}

async function onRemoveSubcommand(interaction: ChatInputCommandInteraction<"cached">) {
    const target = interaction.options.getMentionable(Options.Target, true)
    const permission = interaction.options.getString(Options.Permission, true)

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    await RolePermissions.updateOne(
        { _id: target.id },
        { name: getName(target), $pull: { permissions: permission } },
    )
    await RolePermissions.deleteMany({ permissions: [] })
    await interaction.editReply(`Removed ${inlineCode(permission)}.`)
}

function getName(target: User | GuildMember | Role) {
    if (target instanceof User) {
        return target.username
    } else if (target instanceof GuildMember) {
        return target.user.username
    } else if (target instanceof Role) {
        return target.name
    }
}
