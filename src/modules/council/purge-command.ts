import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, inlineCode } from "discord.js"
import {
    CommandHandlerInteraction,
    LocalizedSlashCommandBuilder,
    MessageOptionsBuilder,
    SlashCommand,
    UserError,
    UserProfile,
    Vouch,
} from "lib"

import { COUNCIL_HEAD_PERMISSIONS } from "@Constants"
import { LogUtil } from "@module/vouch-system/LogUtil"
import { VouchUtil } from "@module/vouch-system/VouchUtil"

SlashCommand({
    builder: new LocalizedSlashCommandBuilder("commands.purge").setDMPermission(false),
    config: { permissions: COUNCIL_HEAD_PERMISSIONS },
    async handler(interaction) {
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
                .setCustomId(interaction.path)
                .addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(reason),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(users),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(rank),
                ),
        )
    },

    async handleModalSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true })

        const components = interaction.components.map((v) => v.components).flat()
        const reason = components.find((v) => v.customId === "reason")!.value
        const users = components.find((v) => v.customId === "users")!.value.split("\n")
        const rank = components.find((v) => v.customId === "rank")?.value.toLowerCase()

        const resolved = new Set<UserProfile>()
        let purged = 0
        const problems: string[] = []
        const warnings: string[] = []

        await Promise.all(
            users.map((user) =>
                purge(interaction, resolved, user, reason, rank)
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
    interaction: CommandHandlerInteraction,
    resolved: Set<UserProfile>,
    resolvable: string,
    reason: string,
    rankInput: string | undefined,
): Promise<string | void> {
    const user = UserProfile.resolve(resolvable)
    if (!user) throw new UserError(`User couldn't be resolved from '${resolvable}'.`)

    if (resolved.has(user)) return `Duplicate entry detected for ${user}!`
    resolved.add(user)

    const rank = VouchUtil.determineDemoteRank(user, interaction.user)
    if (rankInput && rank.toLowerCase() !== rankInput) {
        return `${user} is wrong rank for purge (${rank}).`
    }

    const removeReason = `Demoted from ${rank} by ${interaction.user.tag}.`
    await interaction.client.permissions.removePosition(user, rank, removeReason)

    const vouch = await Vouch.create({
        comment: reason,
        position: rank,
        userId: user.id,
        worth: -2,
    }).catch(console.error)

    if (vouch) {
        LogUtil.logCreate(vouch, interaction.user).catch(console.error)
        await VouchUtil.removeSimilarVouches(vouch).catch((err) =>
            console.error("Failed to remove similar vouches!", err),
        )
    }

    LogUtil.logDemotion(user, rank, interaction.user).catch(console.error)

    await interaction.client.users
        .createDM(user.id)
        .then((dm) => dm.send(`**You lost your ${rank} rank in Bridge Scrims for ${reason}.**`))
        .catch(() => null)

    const announcement = new MessageOptionsBuilder().setContent(`**${user} was removed from ${rank}.**`)
    interaction.client
        .buildSendMessages(`${rank} Announcements Channel`, null, announcement)
        .catch(console.error)
}
