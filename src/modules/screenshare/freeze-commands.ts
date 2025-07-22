import {
    Collection,
    CommandInteraction,
    GuildMember,
    MessageComponentInteraction,
    Role,
    SlashCommandBuilder,
    User,
    userMention,
} from "discord.js"
import { Component, getMainGuild, MessageOptionsBuilder, SlashCommand, UserError } from "lib"
import { Types } from "mongoose"

import { Emojis, MAIN_GUILD_ID } from "@Constants"
import { Config } from "@module/config"
import { PositionRole, Positions } from "@module/positions"
import { UserRejoinRoles } from "@module/sticky-roles"
import { acquired } from "@module/sticky-roles/OfflinePositions"
import { SS_TICKETS } from "./screenshare-command"
import { ScrimsBan } from "./ScrimBan"

const FREEZE_PERMS = "screenshare.freeze"
const UNFREEZE_PERMS = "screenshare.unfreeze"
const FROZEN_CHANNEL = Config.declareType("Frozen Channel")
const FROZEN_VC = Config.declareType("Frozen Voice Channel")

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("freeze")
        .setDescription("Freezes a user")
        .addUserOption((option) =>
            option.setName("user").setDescription("The user to be frozen.").setRequired(true),
        ),

    config: {
        defer: "EphemeralReply",
        permission: FREEZE_PERMS,
        restricted: true,
    },

    async handler(interaction) {
        const userId = interaction.options.getUser("user", true).id
        await freezeMember(interaction, userId)
    },
})

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("unfreeze")
        .setDescription("Unfreezes a user")
        .addUserOption((option) =>
            option.setName("user").setDescription("The user to unfreeze.").setRequired(true),
        ),

    config: {
        defer: "Reply",
        permission: UNFREEZE_PERMS,
        restricted: true,
    },

    async handler(interaction) {
        const target = interaction.options.getUser("user", true)
        await unFreezeMember(target, interaction.user)
        await interaction.editReply(`${Emojis.fire} ${target}, you are now unfrozen.`)
    },
})

export const FREEZE = "FREEZE"
Component({
    builder: FREEZE,
    config: { defer: "EphemeralReply", permission: FREEZE_PERMS },
    async handler(interaction) {
        const userId = interaction.args.shift()!
        await freezeMember(interaction, userId)
    },
})

async function freezeMember(
    interaction: CommandInteraction<"cached"> | MessageComponentInteraction<"cached">,
    userId: string,
) {
    const guild = interaction.guild
    const executor = interaction.user

    SS_TICKETS.cancelCloseTimeouts(userId)
    await interaction.followUp(
        new MessageOptionsBuilder()
            .setContent(`Screenshare ticket timeouts have been canceled for ${userMention(userId)}.`)
            .setEphemeral(true),
    )

    const member = await guild.members.fetch(userId).catch(() => null)
    if (!member) {
        throw new UserError("User is no longer in the server.")
    }

    if (member.user.bot || member.permissions.has("Administrator")) {
        throw new UserError("Forbidden", "I cannot freeze this user.")
    }

    await acquired(member.id, async () => {
        const frozenRoles = PositionRole.getPermittedRoles(Positions.Frozen, guild.id)
        const oldRoles = member.roles.cache
        const newRoles = oldRoles.filter((r) => r.managed || r.id === guild.id).concat(frozenRoles)
        const removeRoles = oldRoles.subtract(newRoles).map((v) => v.id)

        const result = await ScrimsBan.findOneAndUpdate(
            {
                user: member.id,
                roles: { $exists: true }, // if roles is set, the ban is still active
            },
            { $setOnInsert: { roles: removeRoles, executor: executor.id, creation: new Date() } },
            { upsert: true, includeResultMetadata: true },
        )

        // bans without a expiration means its a freeze
        if (result.value?.expiration !== undefined)
            throw new UserError("Already Banned", `${member} has already been scrim banned.`)

        if (result.value) {
            throw new UserError("Already Frozen", `${member} is already frozen.`)
        }

        try {
            await member.roles.set(newRoles, `Frozen by ${executor.tag}.`)
        } catch (error) {
            if (result.lastErrorObject?.upserted) {
                await ScrimsBan.deleteOne(result.lastErrorObject.upserted).catch(console.error)
            }

            throw error
        }
    })

    await sendFrozenMessage(member)
    await interaction.followUp(
        new MessageOptionsBuilder().setContent(`Successfully froze ${member}.`).setEphemeral(true),
    )
}

async function unFreezeMember(user: User, executor: User) {
    await acquired(user.id, async () => {
        // bans without a expiration means its a freeze
        const unfreeze = await ScrimsBan.findOneAndDelete({ user: user.id, expiration: { $exists: false } })
        if (!unfreeze) {
            throw new UserError("Not Frozen", `${user} is not frozen.`)
        }

        await resetRoles(user.id, unfreeze.roles, `Unfrozen by ${executor.tag}.`)
    })
}

export async function resetRoles(userId: string, roles: Types.Long[], reason: string) {
    const guild = getMainGuild()
    const member = await guild?.members.fetch(userId).catch(() => null)
    if (member) {
        try {
            const readdRoles = new Collection(
                roles
                    .map((r) => member.guild.roles.cache.get(r.toString()))
                    .filter((r) => r instanceof Role)
                    .filter((r) => r.editable)
                    .filter((r) => !r.permissions.has("Administrator"))
                    .map((r) => [r.id, r]),
            )

            const frozenRoles = PositionRole.getPermittedRoles(Positions.Frozen, MAIN_GUILD_ID)
            const banRoles = PositionRole.getPermittedRoles(Positions.Banned, MAIN_GUILD_ID)
            const newRoles = member.roles.cache.concat(readdRoles).subtract(frozenRoles).subtract(banRoles)
            await member.roles.set(newRoles, reason)
            return
        } catch (error) {
            console.debugError(error)
        }
    }

    await UserRejoinRoles.updateOne(
        { _id: userId },
        { $addToSet: { roles: { $each: roles } } },
        { upsert: true },
    )
}

async function sendFrozenMessage(member: GuildMember) {
    const frozenChannelId = Config.getConfigValue(FROZEN_CHANNEL, member.guild.id)
    const frozenChannel = frozenChannelId ? member.guild.channels.cache.get(frozenChannelId) : null

    const frozenVcId = Config.getConfigValue(FROZEN_VC, member.guild.id)
    const frozenVc = frozenVcId ? member.guild.channels.cache.get(frozenVcId) : "Frozen VC"

    if (frozenChannel?.isTextBased()) {
        await frozenChannel.send(
            [
                `Hello ${member}, `,
                "would you like to admit to cheating for a shortened ban",
                "or would you like us to search through your computer for cheats? ",
                "You have 5 minutes to either admit in this channel",
                `or join ${frozenVc} and follow the instructions below.\n\n`,
                "**Download AnyDesk from here:**\n",
                "Windows: https://download.anydesk.com/AnyDesk.exe\n",
                "Mac: https://download.anydesk.com/anydesk.dmg\n",
                "Once it's downloaded, run it and **we will need you to send your 9 digit address code** in this channel.\n\n",
                "While screensharing we will download three screenshare tools and require admin control.",
                "Whilst the screenshare is happening\n",
                "**we will need you to __not__ touch your mouse or keyboard unless instructed** to do anything. ",
                "Failure to comply with what we say will result in a ban.\n\n",
                "Our screensharers **will __not__ be going through personal files or attempting to harm your computer**. ",
                "We will only be checking for cheats by inspecting your ",
                "mouse & keyboard software, recycle bin, deleted files and applications ran on this instance of your pc, ",
                "as well as by running pre-bundled, trusted screenshare tools.",
            ].join(""),
        )
    }
}
