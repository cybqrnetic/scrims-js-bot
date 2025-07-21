import { channelMention, codeBlock, EmbedBuilder, Guild, SlashCommandBuilder, User } from "discord.js"
import { bot, getMainGuild, MessageOptionsBuilder, SlashCommand, TimeUtil, UserError } from "lib"

import { Colors, MAIN_GUILD_ID } from "@Constants"
import { Config } from "@module/config"
import { PositionRole, Positions } from "@module/positions"
import { acquired, UserRejoinRoles } from "@module/sticky-roles"
import { ScrimsBan } from "./ScrimBan"
import { resetRoles } from "./freeze-commands"

const PUBLIC_LOG = Config.declareType("Public Scrims Ban Log")
const BAN_LOG = Config.declareType("Scrims Ban Log")
const APPEAL_CHANNEL = Config.declareType("Scrims Ban Appeal")

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("scrimban")
        .setDescription("Bans a user from playing in scrims.")
        .addUserOption((option) =>
            option.setName("user").setDescription("The user to ban.").setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("The reason for the ban.").setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("duration").setDescription("The ban duration (e.g. 30d 2m 1y). [Default: 30d]"),
        ),

    config: {
        defer: "EphemeralReply",
        permission: "screenshare.ban",
        restricted: true,
    },

    async handler(interaction) {
        const reason = interaction.options.getString("reason", true)
        const durationInput = interaction.options.getString("duration")
        const duration = durationInput ? TimeUtil.parseDuration(durationInput) : 30 * 24 * 60 * 60
        if (isNaN(duration) || duration <= 0) {
            throw new UserError("Invalid Duration", "Try something like `30d` or `60d`.")
        }

        const expiration = new Date(Date.now() + duration * 1000)
        const target = interaction.options.getUser("user", true)
        const existing = await acquired(target.id, async () => {
            const discordRoles = await stripRoles(target, interaction.guild, interaction.user)
            const rejoinRoles = await UserRejoinRoles.findByIdAndDelete(target.id)
            const removedRoles = discordRoles.concat(rejoinRoles?.getRoles() ?? [])
            return ScrimsBan.findOneAndUpdate(
                {
                    user: target.id,
                    roles: { $exists: true }, // if roles is set, the ban/freeze is still active
                },
                {
                    expiration,
                    $addToSet: { roles: { $each: removedRoles } },
                    $setOnInsert: { reason, executor: interaction.user.id, creation: new Date() },
                },
                { upsert: true },
            )
        })

        if (existing?.expiration !== undefined) {
            logBanUpdated(target, existing.expiration, expiration, reason, interaction.user)
            await interaction.editReply("Ban expiration updated.")
        } else {
            logBan(target, expiration, reason, interaction.user)
            await interaction.editReply(`${target} has been banned.`)
        }
    },
})

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("scrimunban")
        .setDescription("Unbans a user from playing in scrims.")
        .addUserOption((option) =>
            option.setName("user").setDescription("The user to unban.").setRequired(true),
        )
        .addStringOption((option) => option.setName("reason").setDescription("The reason for the unban.")),

    config: {
        defer: "EphemeralReply",
        permission: "screenshare.unban",
        restricted: true,
    },

    async handler(interaction) {
        const target = interaction.options.getUser("user", true)
        const reason = interaction.options.getString("reason") || undefined

        const ban = await acquired(target.id, async () => {
            const ban = await ScrimsBan.findOneAndUpdate(
                {
                    user: target.id,
                    roles: { $exists: true }, // if roles is set, the ban has not yet expired
                    expiration: { $exists: true }, // if expiration is set, this is a ban, not a freeze
                },
                { unban: { executor: interaction.user.id, reason } },
            )

            if (!ban) {
                throw new UserError("Not Banned", `${target} has not been banned from playing scrims.`)
            }

            await removeBan(ban, `Unbanned from playing scrims by ${interaction.user.tag}.`)
            return ban
        })

        await logUnban(ban, reason, interaction.user)
        await interaction.editReply(`${target} has been unbanned from playing scrims.`)
    },
})

export async function removeBan(ban: ScrimsBan, reason: string) {
    await resetRoles(ban.user, ban.roles, reason)
    await ban.updateOne({ $unset: { roles: "" } })
}

export async function logUnban(ban: ScrimsBan, reason?: string, staff?: User) {
    const user = await bot.users.fetch(ban.user)
    const embed = new EmbedBuilder()
        .setColor(Colors.BrightSeaGreen)
        .setAuthor({ name: `${user.username} Unbanned`, iconURL: user.displayAvatarURL() })
        .setFields(
            { name: "User", value: user.toString(), inline: true },
            { name: "Reason", value: codeBlock(reason ?? "No reason provided.") },
        )

    const publicLog = new MessageOptionsBuilder().addEmbeds(embed)
    Config.buildSendLogMessages(PUBLIC_LOG, null, () => publicLog)

    if (staff) {
        embed.spliceFields(1, 0, { name: "Staff", value: staff.toString(), inline: true })
    }

    const log = new MessageOptionsBuilder().addEmbeds(embed)
    Config.buildSendLogMessages(BAN_LOG, null, () => log)

    user.send(
        new MessageOptionsBuilder().addEmbeds(
            embed.setAuthor(null).setTitle("You've been Unbanned").spliceFields(0, 1).setFooter(dmFooter()),
        ),
    ).catch(console.debugError)
}

function logBan(user: User, expiration: Date, reason: string, staff: User) {
    const embed = new EmbedBuilder()
        .setColor(Colors.RedPink)
        .setAuthor({ name: `${user.username} Scrim Banned`, iconURL: user.displayAvatarURL() })
        .setFields(
            { name: "User", value: user.toString(), inline: true },
            { name: "Expires", value: expiration.toDiscord("R"), inline: true },
            { name: "Reason", value: codeBlock(reason) },
        )

    const publicLog = new MessageOptionsBuilder().addEmbeds(embed)
    Config.buildSendLogMessages(PUBLIC_LOG, null, () => publicLog)

    embed.spliceFields(2, 0, { name: "Staff", value: staff.toString(), inline: true })
    const log = new MessageOptionsBuilder().addEmbeds(embed)
    Config.buildSendLogMessages(BAN_LOG, null, () => log)

    user.send(
        new MessageOptionsBuilder().addEmbeds(
            embed
                .setAuthor(null)
                .setTitle("You've been banned from queuing Scrims")
                .spliceFields(0, 1, appealField())
                .setFooter(dmFooter()),
        ),
    ).catch(console.debugError)
}

function logBanUpdated(user: User, oldExpiration: Date, newExpiration: Date, reason: string, staff: User) {
    const embed = new EmbedBuilder()
        .setColor(Colors.NiceBlue)
        .setAuthor({ name: `${user.username} Scrim Ban Updated`, iconURL: user.displayAvatarURL() })
        .setFields(
            { name: "User", value: user.toString(), inline: true },
            {
                name: "Expires",
                value: `${oldExpiration.toDiscord("R")} ➔ ${newExpiration.toDiscord("R")}`,
                inline: true,
            },
            { name: "Reason", value: codeBlock(reason) },
        )

    const publicLog = new MessageOptionsBuilder().addEmbeds(embed)
    Config.buildSendLogMessages(PUBLIC_LOG, null, () => publicLog)

    embed.spliceFields(2, 0, { name: "Staff", value: staff.toString(), inline: true })
    const log = new MessageOptionsBuilder().addEmbeds(embed)
    Config.buildSendLogMessages(BAN_LOG, null, () => log)

    user.send(
        new MessageOptionsBuilder().addEmbeds(
            embed
                .setAuthor(null)
                .setTitle("Your Scrim Ban was Updated")
                .spliceFields(0, 1, appealField())
                .setFooter(dmFooter()),
        ),
    ).catch(console.debugError)
}

function appealField() {
    const channel = Config.getConfigValue(APPEAL_CHANNEL, MAIN_GUILD_ID)
    return { name: "Appeal Channel", value: channel ? channelMention(channel) : "#ban-appeal", inline: true }
}

function dmFooter() {
    const guild = getMainGuild()
    return guild ? { text: guild.name, iconURL: guild.iconURL() ?? undefined } : null
}

async function stripRoles(target: User, guild: Guild, executor: User) {
    const member = await guild.members.fetch(target.id).catch(() => null)
    if (!member) {
        return []
    }

    const banRoles = PositionRole.getPermittedRoles(Positions.Banned, guild.id)
    const frozenRoles = PositionRole.getPermittedRoles(Positions.Frozen, guild.id)
    const oldRoles = member.roles.cache.subtract(frozenRoles)
    const newRoles = oldRoles.filter((r) => r.managed || r.id === guild.id).concat(banRoles)

    await member.roles.set(newRoles, `Banned from playing scrims by ${executor.tag}.`)
    return oldRoles.subtract(newRoles).map((v) => v.id)
}
