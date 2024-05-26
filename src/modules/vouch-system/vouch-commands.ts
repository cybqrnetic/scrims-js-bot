import { SlashCommandBuilder, SlashCommandStringOption, StringSelectMenuInteraction, User } from "discord.js"

import {
    CommandHandlerInteractionData,
    Component,
    ContextMenu,
    ContextMenuInteraction,
    HTTPError,
    LocalizedContextMenuCommandBuilder,
    LocalizedError,
    LocalizedSlashCommandBuilder,
    Permissions,
    SlashCommand,
    SlashCommandInteraction,
    TimeoutError,
    UserContextMenuInteraction,
    UserError,
    Vouch,
    request,
} from "lib"

import { RANKS } from "@Constants"
import { URLSearchParams } from "url"
import { AutoPromoteHandler } from "./AutoPromoteHandler"
import LogUtil from "./LogUtil"
import { VouchCollection } from "./VouchCollection"
import { VouchUtil } from "./VouchUtil"

const Options = {
    User: "user",
    Comment: "reason",
    ShowExpired: "show_expired",
    Rank: "rank",
    Username: "ign",
}

export const COUNCIL_PERMISSIONS: Permissions = {
    positions: Object.values(RANKS).map((rank) => `${rank} Council`),
}

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
    builder: new LocalizedSlashCommandBuilder("commands.vouches")
        .addUserOption((option) =>
            option
                .setRequired(false)
                .setName(Options.User)
                .setNameAndDescription("commands.vouches.user_option"),
        )
        .addStringOption(buildRankOption("vouches"))
        .addBooleanOption((option) =>
            option
                .setRequired(false)
                .setName(Options.ShowExpired)
                .setNameAndDescription("commands.vouches.expired_option"),
        )
        .setDMPermission(false),

    config: { defer: "reply" },

    async handler(interaction) {
        const user = interaction.options.getUser(Options.User) ?? interaction.user
        const showExpired = interaction.options.getBoolean(Options.ShowExpired) ?? undefined
        const rank = VouchUtil.determineVouchRank(user, interaction.options.getString(Options.Rank))
        await finishVouchesInteraction(interaction, user, rank, showExpired)
    },
})

ContextMenu({
    builder: new LocalizedContextMenuCommandBuilder("commands.vouches.cm").setType(2).setDMPermission(false),
    config: { defer: "ephemeral_reply" },
    async handler(interaction) {
        interaction = interaction as UserContextMenuInteraction
        const rank = VouchUtil.determineVouchRank(interaction.targetUser, null)
        await finishVouchesInteraction(interaction, interaction.targetUser, rank)
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
                .setNameAndDescription("commands.vouch.comment_option"),
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
                .setNameAndDescription("commands.devouch.comment_option"),
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

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("player-vouches")
        .setDescription("Lookup player vouches by ign.")
        .addStringOption((o) =>
            o
                .setName(Options.Username)
                .setDescription("Username of the player")
                .setMinLength(3)
                .setMaxLength(16)
                .setRequired(true),
        )
        .addStringOption(buildRankOption("vouches"))
        .setDMPermission(true),

    async handler(interaction) {
        await interaction.deferReply()

        const ign = interaction.options.getString(Options.Username, true)
        const url = `https://api.scrims.network/v1/user?${new URLSearchParams({ username: ign })}`
        const resp = await request(url).catch((error) => {
            if (error instanceof HTTPError)
                throw new LocalizedError(`api.request_failed`, "Scrims Network API")

            if (error instanceof TimeoutError) throw new LocalizedError("api.timeout", "Scrims Network API")

            throw error
        })

        const body = await resp.json()
        const data = body["user_data"]
        if (!data) throw new UserError(`Player by the name of '${ign}' couldn't be found!`)
        if (!data.discordId)
            throw new UserError(`${data.username} doesn't have their Discord account linked.`)

        const user = await interaction.client.users.fetch(data.discordId)
        const rank = VouchUtil.determineVouchRank(user, interaction.options.getString(Options.Rank))

        const vouches = await VouchCollection.fetch(user.id, rank)
        const message = vouches.toMessage(interaction.i18n, {}, interaction.guildId ?? undefined)
        if (message.embeds[0]?.fields?.length)
            message.embeds[0].thumbnail = { url: `https://mc-heads.net/head/${data._id}/left` }

        await interaction.editReply(message)
    },
})
