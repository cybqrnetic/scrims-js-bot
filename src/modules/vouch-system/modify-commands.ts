import {
    ButtonBuilder,
    ButtonStyle,
    SlashCommandBuilder,
    SlashCommandStringOption,
    StringSelectMenuInteraction,
    User,
    bold,
    userMention,
} from "discord.js"

import {
    CommandHandlerInteractionData,
    Component,
    ContextMenuInteraction,
    LocalizedSlashCommandBuilder,
    MessageOptionsBuilder,
    SlashCommand,
    SlashCommandInteraction,
    UserError,
    Vouch,
} from "lib"

import { COUNCIL_PERMISSIONS, Positions, RANKS } from "@Constants"
import { AutoPromoteHandler } from "./AutoPromoteHandler"
import { LogUtil } from "./LogUtil"
import { VouchCollection } from "./VouchCollection"
import { VouchUtil } from "./VouchUtil"

const Options = {
    User: "user",
    Comment: "reason",
    Rank: "rank",
}

const STAFF_PERMISSIONS = { positionLevel: Positions.Staff }

function buildRankOption(command: string) {
    return new SlashCommandStringOption()
        .setRequired(false)
        .setName(Options.Rank)
        .setNameAndDescription(`commands.${command}.rank_option`)
        .setChoices(...Object.values(RANKS).map((v) => ({ name: v, value: v })))
}

SlashCommand({
    builder: new LocalizedSlashCommandBuilder("commands.remove_vouch")
        .addUserOption((option) =>
            option
                .setRequired(true)
                .setName(Options.User)
                .setNameAndDescription("commands.remove_vouch.user_option"),
        )
        .addStringOption(buildRankOption("remove_vouch"))
        .setDMPermission(false),

    config: { permissions: COUNCIL_PERMISSIONS, defer: "ephemeral_reply" },

    async handler(interaction) {
        const user = interaction.options.getUser(Options.User, true)
        const rank = VouchUtil.determineVouchRank(
            user,
            interaction.options.getString(Options.Rank),
            interaction.user,
        )

        const vouches = await VouchCollection.fetch(user.id, rank)
        await interaction.editReply(vouches.toRemoveMessage(interaction.i18n, interaction.guildId!))
    },
})

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("purge-vouches")
        .setDescription("Remove all of a councils' vouches.")
        .addUserOption((option) =>
            option
                .setRequired(true)
                .setName(Options.User)
                .setDescription("The council member to remove the vouches from."),
        )
        .setDefaultMemberPermissions("0")
        .setDMPermission(false),

    config: { permissions: STAFF_PERMISSIONS, defer: "ephemeral_reply" },

    async handler(interaction) {
        const user = interaction.options.getUser(Options.User, true)
        const count = await Vouch.countDocuments({ executorId: user.id })
        await interaction.editReply(
            new MessageOptionsBuilder()
                .setContent(bold(`Are you sure you want to remove all ${count} of ${user}'s vouches?`))
                .addButtons(
                    new ButtonBuilder()
                        .setLabel("Confirm")
                        .setStyle(ButtonStyle.Danger)
                        .setCustomId(`PURGE_VOUCHES/${user.id}`),
                    new ButtonBuilder()
                        .setLabel("Cancel")
                        .setStyle(ButtonStyle.Secondary)
                        .setCustomId("CANCEL"),
                ),
        )
    },
})

Component({
    builder: "PURGE_VOUCHES",
    config: { permissions: STAFF_PERMISSIONS, defer: "ephemeral_reply" },
    async handler(interaction) {
        const userId = interaction.args.shift()!
        const result = await Vouch.deleteMany({ executorId: userId })
        await interaction.editReply(
            new MessageOptionsBuilder().setContent(
                `Removed all ${result.deletedCount} vouches from ${userMention(userId)}.`,
            ),
        )
    },
})

Component({
    builder: "REMOVE_VOUCH",
    config: { permissions: COUNCIL_PERMISSIONS, defer: "update" },
    async handler(i) {
        const interaction = i as StringSelectMenuInteraction & CommandHandlerInteractionData

        const user = interaction.client.users.resolve(interaction.args.shift()!)
        if (!user) throw new UserError("Unknown User.")

        const rank = interaction.args.shift()!
        VouchUtil.checkVouchPermissions(user, rank, interaction.user)

        const vouch = await Vouch.findOneAndDelete({ _id: interaction.values[0] })
        if (vouch) LogUtil.logDelete(vouch, interaction.user).catch(console.error)

        const vouches = await VouchCollection.fetch(user.id, rank)
        await interaction.editReply(vouches.toRemoveMessage(interaction.i18n, interaction.guildId!))
    },
})

SlashCommand({
    builder: new LocalizedSlashCommandBuilder("commands.vouch")
        .addUserOption((option) =>
            option
                .setRequired(true)
                .setName(Options.User)
                .setNameAndDescription("commands.vouch.user_option"),
        )
        .addStringOption((option) =>
            option
                .setRequired(false)
                .setName(Options.Comment)
                .setNameAndDescription("commands.vouch.comment_option")
                .setMaxLength(500),
        )
        .setDMPermission(false),

    config: { permissions: COUNCIL_PERMISSIONS, defer: "ephemeral_reply" },

    async handler(interaction) {
        await addVouch(interaction, 1)
    },
})

SlashCommand({
    builder: new LocalizedSlashCommandBuilder()
        .setNameAndDescription("commands.devouch")
        .addUserOption((option) =>
            option
                .setRequired(true)
                .setName(Options.User)
                .setNameAndDescription("commands.devouch.user_option"),
        )
        .addStringOption((option) =>
            option
                .setRequired(false)
                .setName(Options.Comment)
                .setNameAndDescription("commands.devouch.comment_option")
                .setMaxLength(500),
        )
        .setDMPermission(false),

    config: { permissions: COUNCIL_PERMISSIONS, defer: "ephemeral_reply" },

    async handler(interaction) {
        await addVouch(interaction, -1)
    },
})

async function addVouch(interaction: SlashCommandInteraction, worth: number) {
    const user = interaction.options.getUser(Options.User, true)
    const comment = interaction.options.getString(Options.Comment)
    const rank = VouchUtil.determineVouchRank(
        user,
        interaction.options.getString(Options.Rank),
        interaction.user,
    )

    const vouch = await Vouch.create({
        comment: comment ?? undefined,
        executorId: interaction.user.id,
        position: rank,
        userId: user.id,
        worth,
    })

    LogUtil.logCreate(vouch).catch(console.error)
    await VouchUtil.removeSimilarVouches(vouch).catch(console.error)

    if (worth > 0) {
        AutoPromoteHandler.onVouched(vouch)
        await user
            .send(
                `**You have been given a ${rank} vouch** by ${interaction.user}` +
                    (comment ? ` for *${comment}*.` : "."),
            )
            .catch(() => null)
    }

    await finishVouchesInteraction(interaction, user, rank)
}

async function finishVouchesInteraction(
    interaction: SlashCommandInteraction | ContextMenuInteraction,
    user: User,
    rank: string,
    includeExpired?: boolean,
) {
    const vouches = await VouchCollection.fetch(user.id, rank)

    if (includeExpired === undefined) {
        includeExpired = !!interaction.client.permissions.hasPosition(user, rank)
    }

    await interaction.editReply(
        vouches.toMessage(interaction.i18n, { includeExpired }, interaction.guildId!).setAllowedMentions(),
    )

    if (interaction.userHasPosition(`${rank} Council`)) {
        if (vouches.getCovered().length)
            await interaction
                .followUp(
                    vouches
                        .toMessage(interaction.i18n, { onlyHidden: true }, interaction.guildId!)
                        .setAllowedMentions()
                        .setEphemeral(true),
                )
                .catch(console.error)
    }
}
