import { Emojis } from "@Constants"
import { Config } from "@module/config"
import { OnlinePositions, PositionRole, Positions } from "@module/positions"
import { acquired, UserRejoinRoles } from "@module/sticky-roles"
import { GuildMember, Role, SlashCommandBuilder } from "discord.js"
import { Component, MessageOptionsBuilder, SlashCommand, UserError } from "lib"
import { SS_TICKETS } from "./screenshare-command"

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
        const member = interaction.options.getMember("user")
        if (!member) throw new UserError("User not found.")
        await freezeMember(member)
        await interaction.editReply(`Successfully froze ${member}.`)
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
        const member = interaction.options.getMember("user")
        if (!member) throw new UserError("User not found")
        await unFreezeMember(member)
        await interaction.editReply(`${Emojis.fire} ${member}, you are now unfrozen.`)
    },
})

export const FREEZE = "FREEZE"
Component({
    builder: FREEZE,
    config: { defer: "EphemeralReply", permission: FREEZE_PERMS },
    async handler(interaction) {
        const userId = interaction.args.shift()!
        const member = await interaction.guild.members.fetch(userId).catch(() => null)
        if (!member) throw new UserError("User Not Found")
        await freezeMember(member)
        await interaction.editReply(`Successfully froze ${member}.`)
    },
})

async function freezeMember(member: GuildMember) {
    if (!member.manageable) throw new UserError("Forbidden", "I cannot freeze this user.")
    if (OnlinePositions.hasPosition(member, Positions.Frozen)) {
        throw new UserError("Already Frozen", "This user is already frozen.")
    }

    SS_TICKETS.cancelCloseTimeouts(member.id)
    const frozenRoles = PositionRole.getPermittedRoles(Positions.Frozen, member.guild.id)

    await acquired(member.id, async () => {
        const removeRoles = member.roles.cache.filter((r) => !r.managed).map((r) => r.id)
        await Promise.all([
            UserRejoinRoles.updateOne(
                { _id: member.id },
                { $addToSet: { roles: { $each: removeRoles } } },
                { upsert: true },
            ),
            Promise.all(removeRoles.map((r) => member.roles.remove(r, `Frozen by ${member.user.tag}.`))),
            Promise.all(frozenRoles.map((r) => member.roles.add(r, `Frozen by ${member.user.tag}.`))),
        ])
    })

    await sendFrozenMessage(member)
}

async function unFreezeMember(member: GuildMember) {
    if (!member.manageable) throw new UserError("Forbidden", "I cannot unfreeze this user.")
    if (!OnlinePositions.hasPosition(member, Positions.Frozen)) {
        throw new UserError("Not Frozen", "This user is not frozen.")
    }

    await acquired(member.id, async () => {
        const rejoinRoles = await UserRejoinRoles.findByIdAndDelete(member.id)
        if (!rejoinRoles) return

        const roles = rejoinRoles.roles
            .map((r) => member.guild.roles.cache.get(r.toString()))
            .filter((r): r is Role => r !== undefined && !r.managed)

        await member.roles.add(roles, `Unfrozen by ${member.user.tag}.`)
        const log = roles.filter((r) => PositionRole.declaredRoles().has(r.id))

        if (log.length) {
            Config.buildSendLogMessages(
                "Positions Log Channel",
                [member.guild.id],
                new MessageOptionsBuilder().setContent(
                    `${Emojis.snowflake} ${member} Got ${log.join(" ")} back after being frozen.`,
                ),
            )
        }
    })

    const frozenRoles = PositionRole.getPermittedRoles(Positions.Frozen, member.guild.id)
    await member.roles.remove(frozenRoles)
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
