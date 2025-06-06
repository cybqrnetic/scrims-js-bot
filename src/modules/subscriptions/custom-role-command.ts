import {
    ChatInputCommandInteraction,
    Events,
    GuildPremiumTier,
    SlashCommandBuilder,
    SlashCommandSubcommandBuilder,
} from "discord.js"

import { membersFetched } from "@module/member-fetcher"
import { HostPermissions } from "@module/permissions"
import { PositionRole, Positions } from "@module/positions"
import { bot, BotListener, ColorUtil, DB, Profanity, SlashCommand, TextUtil, UserError } from "lib"
import { SubscriptionFeaturePermissions } from "."
import { CustomRole } from "./CustomRole"

SlashCommand({
    builder: new SlashCommandBuilder()
        .setLocalizations("commands.custom_role")
        .addSubcommand(buildCreateSubcommand())
        .addSubcommand((sub) => sub.setLocalizations("commands.custom_role.remove")),

    config: { defer: "EphemeralReply", permission: SubscriptionFeaturePermissions.CustomRole },

    subHandlers: {
        create: onCreateSubcommand,
        // Might wanna add this later: just pass undefined instead of null or default values for the options.
        // edit: (interaction) => onCreateSubcommand(interaction, true),
        remove: onRemoveSubcommand,
    },
})

async function onCreateSubcommand(interaction: ChatInputCommandInteraction<"cached">) {
    const name = interaction.options.getString("role-name") || interaction.user.displayName
    const color = interaction.options.getString("role-color")

    const image = interaction.options.getAttachment("role-image")
    const emojiInput = interaction.options.getString("role-emoji")
    const emoji = emojiInput && TextUtil.getFirstEmoji(emojiInput)

    if (image && emoji) {
        throw new UserError(
            "Invalid Role Icon",
            "You cannot provide both an image and an emoji for the role icon. Please choose one.",
        )
    }

    if ((emojiInput || image) && interaction.guild.premiumTier < GuildPremiumTier.Tier2) {
        throw new UserError(
            "Role Icon Unavailable",
            "This server does not have enough boosts to use role images or emojis.",
        )
    }

    if (emojiInput && !emoji) {
        throw new UserError(
            "Invalid Emoji",
            "The emoji provided is not a valid emoji. Please provide a valid unicode emoji (not a custom emoji) or leave it blank.",
        )
    }

    if (image) {
        if (!image.contentType?.startsWith("image/")) {
            throw new UserError(
                "Invalid Image",
                "The attachment provided is not a valid image. Please provide a valid image file.",
            )
        }

        if (image.size > 2000 * 1024) {
            throw new UserError(
                "Image Too Large",
                "The image provided is too large. Please provide an image smaller than 2MB.",
            )
        }
    }

    const hexColor = color ? ColorUtil.parseHex(color) : 0
    if (hexColor && isNaN(hexColor)) {
        throw new UserError("Invalid Color", "The color provided is not a valid hex color. (eg. #FF0000)")
    }

    if (name && (await Profanity.isProfanity(name))) {
        throw new UserError(
            "Profanity Detected",
            "The name contains profanity. Please choose another name, or open a support ticket to appeal.",
        )
    }

    const existingRole = await CustomRole.findOne({
        guildId: interaction.guildId,
        userId: interaction.user.id,
    })

    if (existingRole && interaction.guild.roles.cache.has(existingRole._id)) {
        await interaction.guild.roles.edit(existingRole._id, {
            name: name,
            color: hexColor,
            icon: image?.url ?? null,
            unicodeEmoji: emoji ?? null,
        })

        if (!interaction.member.roles.cache.has(existingRole._id)) {
            await interaction.member.roles.add(existingRole._id, "Custom Role")
        }
    } else {
        existingRole?.deleteOne().catch(console.error)

        // Should be right under the lowest trial support role
        const trialSupportRoles = PositionRole.getRoles(Positions.TrialSupport, interaction.guildId)
        const customRolePosition = Math.min(...trialSupportRoles.map((role) => role.position))

        const role = await interaction.guild.roles.create({
            name: name,
            color: hexColor,
            icon: image?.url,
            unicodeEmoji: emoji,
            position: customRolePosition,
        })

        try {
            await interaction.member.roles.add(role, "Custom Role")
            await CustomRole.create({
                _id: role.id,
                guildId: interaction.guildId,
                userId: interaction.user.id,
            })
        } catch (error) {
            role.delete().catch(console.error)
            throw error
        }
    }

    await interaction.editReply(
        `Successfully created the custom role **${name}**! ` +
            `You can remove it with **\`/custom-role remove\`**.`,
    )
}

async function onRemoveSubcommand(interaction: ChatInputCommandInteraction<"cached">) {
    const customRole = await CustomRole.findOne({ guildId: interaction.guildId, userId: interaction.user.id })
    if (!customRole) {
        throw new UserError("No Custom Role", "You do not have a custom role.")
    }

    await deleteCustomRole(customRole)
    await interaction.editReply("Successfully removed your custom role!")
}

function buildCreateSubcommand() {
    return new SlashCommandSubcommandBuilder()
        .setLocalizations("commands.custom_role.create")
        .addStringOption((option) =>
            option.setLocalizations("commands.custom_role.create.name_option").setRequired(false),
        )
        .addStringOption((option) =>
            option.setLocalizations("commands.custom_role.create.color_option").setRequired(false),
        )
        .addAttachmentOption((option) =>
            option.setLocalizations("commands.custom_role.create.image_option").setRequired(false),
        )
        .addStringOption((option) =>
            option.setLocalizations("commands.custom_role.create.emoji_option").setRequired(false),
        )
}

BotListener(Events.GuildMemberRemove, async (_bot, member) => {
    const customRole = await CustomRole.findOne({ guildId: member.guild.id, userId: member.id })
    if (customRole) {
        await deleteCustomRole(customRole)
    }
})

HostPermissions.on("update", async (user, update) => {
    if (update.removed(SubscriptionFeaturePermissions.CustomRole)) {
        await deleteCustomRoles(user)
    }
})

const customRoles = DB.addStartupTask(() => CustomRole.find())
void membersFetched().then(() => {
    for (const customRole of customRoles.value) {
        const guild = bot.guilds.cache.get(customRole.guildId)
        const member = guild?.members.cache.get(customRole.userId)
        if (!member?.hasPermission(SubscriptionFeaturePermissions.CustomRole)) {
            deleteCustomRole(customRole).catch(console.error)
        }
    }
})

async function deleteCustomRoles(user: string) {
    const customRoles = await CustomRole.find({ userId: user })
    for (const customRole of customRoles) {
        deleteCustomRole(customRole).catch(console.error)
    }
}

async function deleteCustomRole(customRole: CustomRole) {
    const guild = bot.guilds.cache.get(customRole.guildId)
    await Promise.all([guild?.roles.delete(customRole._id).catch(() => null), customRole.deleteOne()])
}
