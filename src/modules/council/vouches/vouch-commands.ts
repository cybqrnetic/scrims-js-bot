import {
    ButtonBuilder,
    ButtonStyle,
    InteractionContextType,
    SlashCommandBuilder,
    SlashCommandStringOption,
    bold,
    userMention,
    type ChatInputCommandInteraction,
} from "discord.js"
import { Component, MessageOptionsBuilder, ScrimsNetwork, SlashCommand, UserError } from "lib"
import { DateTime } from "luxon"

import { RANKS } from "@Constants"
import { Vouch, VouchCollection, VouchUtil } from "@module/vouch-system"
import { LogUtil } from "./LogUtil"

const Options = {
    User: "user",
    Ign: "ign",
    Comment: "reason",
    Rank: "rank",
}

function buildRankOption(command: string) {
    return new SlashCommandStringOption()
        .setRequired(false)
        .setName(Options.Rank)
        .setLocalizations(`commands.${command}.rank_option`)
        .setChoices(...Object.values(RANKS).map((v) => ({ name: v, value: v })))
}

SlashCommand({
    builder: new SlashCommandBuilder()
        .setLocalizations("commands.remove_vouch")
        .addUserOption((option) =>
            option
                .setRequired(true)
                .setName(Options.User)
                .setLocalizations("commands.remove_vouch.user_option"),
        )
        .addStringOption(buildRankOption("remove_vouch"))
        .setDefaultMemberPermissions("0"),

    config: { defer: "EphemeralReply" },

    async handler(interaction) {
        const user = interaction.options.getUser(Options.User, true)
        const rank = VouchUtil.determineVouchRank(user, interaction.options.getString(Options.Rank))
        if (!interaction.user.hasPermission(`council.${rank.toLowerCase()}.manageVouches`))
            throw new UserError(`You don't have permissions to manage ${rank} vouches!`)

        const vouches = await VouchCollection.fetch(user.id, rank)
        await interaction.editReply(vouches.toRemoveMessage(interaction.i18n, interaction.guildId))
    },
})

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("purge-vouches")
        .setDescription("Remove all of a council's vouches.")
        .addUserOption((option) =>
            option
                .setRequired(true)
                .setName(Options.User)
                .setDescription("The council member to remove the vouches from."),
        )
        .addStringOption((option) =>
            option
                .setRequired(true)
                .setName(Options.Rank)
                .setDescription("The rank to remove the vouches from.")
                .addChoices(...Object.values(RANKS).map((v) => ({ name: v, value: v }))),
        )
        .setDefaultMemberPermissions("0")
        .setContexts(InteractionContextType.Guild),

    config: { defer: "EphemeralReply" },

    async handler(interaction) {
        const user = interaction.options.getUser(Options.User, true)
        const rank = interaction.options.getString("rank", true)
        if (!interaction.user.hasPermission(`council.${rank.toLowerCase()}.manageVouches`))
            throw new UserError(`You don't have permissions to manage ${rank} vouches!`)

        const count = await Vouch.countDocuments({ executorId: user.id, position: rank })
        await interaction.editReply(
            new MessageOptionsBuilder()
                .setContent(
                    bold(`Are you sure you want to remove all ${count} of ${user}'s ${rank} vouches?`),
                )
                .addButtons(
                    new ButtonBuilder()
                        .setLabel("Confirm")
                        .setStyle(ButtonStyle.Danger)
                        .setCustomId(`PURGE_VOUCHES/${user.id}/${rank}`),
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
    config: { defer: "EphemeralReply" },
    async handler(interaction) {
        const userId = interaction.args.shift()!
        const rank = interaction.args.shift()!

        const result = await Vouch.deleteMany({ executorId: userId, position: rank })
        await interaction.editReply(
            new MessageOptionsBuilder().setContent(
                `Removed all ${result.deletedCount} ${rank} vouches from ${userMention(userId)}.`,
            ),
        )
    },
})

Component({
    builder: "REMOVE_VOUCH",
    config: { defer: "Update" },
    async handler(interaction) {
        if (!interaction.isStringSelectMenu()) return

        const user = interaction.client.users.resolve(interaction.args.shift()!)
        if (!user) throw new UserError("Unknown User.")

        const rank = interaction.args.shift()!
        const vouch = await Vouch.findOneAndDelete({ _id: interaction.values[0] })
        if (vouch) LogUtil.logDelete(vouch, interaction.user)

        const vouches = await VouchCollection.fetch(user.id, rank)
        await interaction.editReply(vouches.toRemoveMessage(interaction.i18n, interaction.guildId))
    },
})

SlashCommand({
    builder: new SlashCommandBuilder()
        .setLocalizations("commands.vouch")
        .addUserOption((option) =>
            option.setRequired(false).setName(Options.User).setLocalizations("commands.vouch.user_option"),
        )
        .addStringOption((option) =>
            option
                .setRequired(false)
                .setName(Options.Ign)
                .setLocalizations("commands.vouch.ign_option")
                .setMinLength(3)
                .setMaxLength(16),
        )
        .addStringOption((option) =>
            option
                .setRequired(false)
                .setName(Options.Comment)
                .setLocalizations("commands.vouch.comment_option")
                .setMaxLength(500),
        )
        .setDefaultMemberPermissions("0"),

    config: { defer: "EphemeralReply" },

    async handler(interaction) {
        await addVouch(interaction, 1)
    },
})

SlashCommand({
    builder: new SlashCommandBuilder()
        .setLocalizations("commands.devouch")
        .addUserOption((option) =>
            option.setRequired(false).setName(Options.User).setLocalizations("commands.devouch.user_option"),
        )
        .addStringOption((option) =>
            option
                .setRequired(false)
                .setName(Options.Ign)
                .setLocalizations("commands.devouch.ign_option")
                .setMinLength(3)
                .setMaxLength(16),
        )
        .addStringOption((option) =>
            option
                .setRequired(false)
                .setName(Options.Comment)
                .setLocalizations("commands.devouch.comment_option")
                .setMaxLength(500),
        )
        .setDefaultMemberPermissions("0"),

    config: { defer: "EphemeralReply" },

    async handler(interaction) {
        await addVouch(interaction, -1)
    },
})

async function addVouch(interaction: ChatInputCommandInteraction<"cached">, worth: number) {
    let user = interaction.options.getUser(Options.User)
    if (!user) {
        const ign = interaction.options.getString(Options.Ign)
        if (ign) {
            const userId = await ScrimsNetwork.fetchUserId(ign)
            user = await interaction.client.users.fetch(userId)
        } else {
            throw new UserError("You must specify a user or ign!")
        }
    }

    const comment = interaction.options.getString(Options.Comment) ?? undefined
    const rank = VouchUtil.determineVouchRank(
        user,
        interaction.options.getString(Options.Rank),
        interaction.user,
    )

    const filter = {
        executorId: interaction.user.id,
        position: rank,
        userId: user.id,
    }

    const vouch = await Vouch.findOneAndUpdate(
        { givenAt: { $lte: DateTime.now().plus({ days: 7 }).toJSDate() }, ...filter },
        { ...filter, worth, givenAt: new Date(), ...(comment ? { comment } : { $unset: { comment: "" } }) },
        { upsert: true, new: true },
    )

    Vouch.emitUpdate(vouch)
    LogUtil.logCreate(vouch)

    if (worth > 0) {
        await user
            .send(
                `**You have been given a ${rank} vouch** by ${interaction.user}` +
                    (comment ? ` for *${comment}*.` : "."),
            )
            .catch(() => null)
    }

    await VouchUtil.finishVouchesInteraction(interaction, user, rank)
}
