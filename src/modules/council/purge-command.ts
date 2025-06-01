import {
    ActionRowBuilder,
    MessageFlags,
    ModalBuilder,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
    bold,
    inlineCode,
    userMention,
    type BaseInteraction,
} from "discord.js"
import { MessageOptionsBuilder, SlashCommand, UserError } from "lib"
import { DateTime } from "luxon"

import { Config } from "@module/config"
import { LogUtil } from "@module/council/vouches/LogUtil"
import { OnlinePositions } from "@module/positions"
import { UserProfile } from "@module/profiler"
import { OfflinePositions } from "@module/sticky-roles"
import { SubscriptionFeaturePermissions } from "@module/subscriptions"
import { Vouch } from "@module/vouch-system"
import { VouchUtil } from "@module/vouch-system/VouchUtil"

SlashCommand({
    builder: new SlashCommandBuilder()
        .setLocalizations("commands.purge")
        .addBooleanOption((option) =>
            option
                .setName("inactivity-purge")
                .setDescription("If this is an inactivity purge, immune players won't get purged.")
                .setRequired(true),
        )
        .setDefaultMemberPermissions("0"),

    async handler(interaction) {
        const isInactivityPurge = interaction.options.getBoolean("inactivity-purge", true)

        const reason = new TextInputBuilder()
            .setLabel("Reason")
            .setCustomId("reason")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)

        const users = new TextInputBuilder()
            .setLabel("Users")
            .setCustomId("users")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder(
                "Discord names or IDs joined by line breaks e.g.\nwhatcats\n977686340412006450\n...",
            )

        const rank = new TextInputBuilder()
            .setLabel("Rank")
            .setCustomId("rank")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder("Pristine, Prime, Private or Premium")

        await interaction.showModal(
            new ModalBuilder()
                .setTitle("Council Purge")
                .setCustomId(`${interaction.commandName}/${isInactivityPurge}`)
                .addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(reason),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(users),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(rank),
                ),
        )
    },

    async handleModalSubmit(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        const isInactivityPurge = interaction.args.shift()! === "true"
        const components = interaction.components.map((v) => v.components).flat()
        const reason = components.find((v) => v.customId === "reason")!.value
        const rank = components.find((v) => v.customId === "rank")?.value.toLowerCase()
        const users = components.find((v) => v.customId === "users")!.value.split("\n")

        const resolved = new Set<string>()
        let purged = 0
        const problems: string[] = []
        const warnings: string[] = []

        await Promise.all(
            users.map((user) =>
                purge(interaction, resolved, user, reason, rank, isInactivityPurge)
                    .then((warning) => {
                        if (warning) warnings.push(warning)
                        purged++
                    })
                    .catch((error) => {
                        if (error instanceof UserError) problems.push(error.message)
                        else {
                            console.error(error)
                            problems.push(`Failed to purge ${inlineCode(user)} due to an unexpected error.`)
                        }
                    }),
            ),
        )

        let content = `## Purged ${purged}/${users.length} User(s)`

        if (problems.length) content += `\n### Problems:`
        for (const problem of problems) {
            const append = `\n- ${problem}`
            if (append.length + content.length > 2000) break
            content += append
        }

        if (content.length < 2000) {
            if (warnings.length) content += `\n### Warnings:`
            for (const warning of warnings) {
                const append = `\n- ${warning}`
                if (append.length + content.length > 2000) break
                content += append
            }
        }

        await interaction.editReply(content)
    },
})

async function purge(
    interaction: BaseInteraction<"cached">,
    resolved: Set<string>,
    resolvable: string,
    reason: string,
    rankInput: string | undefined,
    isInactivityPurge: boolean,
): Promise<string | void> {
    const user = UserProfile.resolveId(resolvable)
    if (!user) throw new UserError(`User couldn't be resolved from '${resolvable}'.`)
    const mention = userMention(user)

    if (resolved.has(user)) return `Duplicate entry detected for ${mention}!`
    resolved.add(user)

    const rank = VouchUtil.determineDemoteRank(user, interaction.user)
    if (rankInput && rank.toLowerCase() !== rankInput) {
        return `${mention} is wrong rank for purge (${rank}).`
    }

    const member = interaction.guild.members.resolve(user)
    if (member && OnlinePositions.hasPosition(member, `${rank} Council`)) {
        return `${mention} is a ${rank} council member.`
    }

    if (isInactivityPurge && member?.hasPermission(SubscriptionFeaturePermissions.PurgeImmunity)) {
        return `${mention} is immune to inactivity purge.`
    }

    const removeReason = `Demoted from ${rank} by ${interaction.user.tag}.`
    await OfflinePositions.removePosition(user, rank, removeReason)

    const filter = {
        position: rank,
        userId: user,
        worth: -2,
    }

    const vouch = await Vouch.findOneAndUpdate(
        {
            givenAt: { $lte: DateTime.now().plus({ days: 7 }).toJSDate() },
            executorId: { $exists: false },
            ...filter,
        },
        { ...filter, comment: reason, givenAt: new Date() },
        { upsert: true, new: true },
    ).catch(console.error)

    if (vouch) LogUtil.logCreate(vouch, interaction.user)
    LogUtil.logDemotion(user, rank, interaction.user)

    await interaction.client.users
        .createDM(user)
        .then((dm) => dm.send(bold(`You lost your ${rank} rank in Bridge Scrims for ${reason}.`)))
        .catch(() => null)

    const announcement = new MessageOptionsBuilder().setContent(bold(`${mention} was removed from ${rank}.`))
    Config.buildSendMessages(`${rank} Announcements Channel`, null, announcement)
}
