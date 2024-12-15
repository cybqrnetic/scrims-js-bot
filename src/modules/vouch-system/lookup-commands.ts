import {
    ApplicationCommandOptionChoiceData,
    ApplicationCommandType,
    ApplicationIntegrationType,
    InteractionContextType,
    SlashCommandStringOption,
    User,
    type ContextMenuCommandType,
} from "discord.js"

import {
    ContextMenu,
    LocalizedContextMenuCommandBuilder,
    LocalizedError,
    LocalizedSlashCommandBuilder,
    RequestError,
    SlashCommand,
    TimeoutError,
    UserError,
    UserProfile,
    request,
} from "lib"

import { RANKS } from "@Constants"
import { URLSearchParams } from "url"
import { VouchUtil } from "./VouchUtil"

const Options = {
    User: "user",
    Username: "username",
    Ign: "ign",
    ShowExpired: "show-expired",
    Rank: "rank",
}

function buildRankOption(command: string) {
    return new SlashCommandStringOption()
        .setRequired(false)
        .setName(Options.Rank)
        .setNameAndDescription(`commands.${command}.rank_option`)
        .setChoices(...Object.values(RANKS).map((v) => ({ name: v, value: v })))
}

SlashCommand({
    builder: new LocalizedSlashCommandBuilder("commands.vouches")
        .addUserOption((option) =>
            option
                .setRequired(false)
                .setName(Options.User)
                .setDescription("The Discord mention of the person to check."),
        )
        .addStringOption((option) =>
            option
                .setRequired(false)
                .setName(Options.Username)
                .setDescription("The Discord username of the person to check.")
                .setAutocomplete(true),
        )
        .addStringOption((option) =>
            option
                .setRequired(false)
                .setName(Options.Ign)
                .setDescription("The Minecraft username of the person to check.")
                .setMinLength(3)
                .setMaxLength(16),
        )
        .addStringOption(buildRankOption("vouches"))
        .addBooleanOption((option) =>
            option
                .setRequired(false)
                .setName(Options.ShowExpired)
                .setNameAndDescription("commands.vouches.expired_option"),
        ),

    anyContext: true,
    userInstall: true,

    async handler(interaction) {
        await interaction.deferReply()
        let user: User

        const userInput = interaction.options.getUser(Options.User)
        const nameInput = interaction.options.getString(Options.Username)
        const ignInput = interaction.options.getString(Options.Ign)

        if (userInput) {
            user = userInput
        } else if (nameInput) {
            const userId = UserProfile.resolve(nameInput)?._id
            if (!userId) throw new UserError(`Couldn't find Discord user with the name: '${nameInput}'`)
            user = await interaction.client.users.fetch(userId)
        } else if (ignInput) {
            const userId = await fetchUserId(ignInput)
            user = await interaction.client.users.fetch(userId)
        } else {
            user = interaction.user
        }

        await interaction.client.host?.members.fetch({ user, force: true }).catch(() => null)

        const showExpired = interaction.options.getBoolean(Options.ShowExpired) ?? undefined
        const rank = VouchUtil.determineVouchRank(user, interaction.options.getString(Options.Rank))
        await VouchUtil.finishVouchesInteraction(interaction, user, rank, showExpired)
    },

    async handleAutocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase()
        const matches: ApplicationCommandOptionChoiceData[] = []
        for (const name of UserProfile.getNames()) {
            if (name.startsWith(focused)) matches.push({ name, value: name })
            if (matches.length === 25) break
        }
        await interaction.respond(matches)
    },
})

ContextMenu({
    builder: new LocalizedContextMenuCommandBuilder("commands.vouches.cm")
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel,
        )
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
        .setType(ApplicationCommandType.User as ContextMenuCommandType),

    config: { defer: "ephemeral_reply" },
    async handler(interaction) {
        if (!interaction.isUserContextMenuCommand()) return

        const rank = VouchUtil.determineVouchRank(interaction.targetUser, null)
        await VouchUtil.finishVouchesInteraction(interaction, interaction.targetUser, rank)
    },
})

async function fetchUserId(ign: string) {
    const url = `https://api.scrims.network/v1/user?${new URLSearchParams({ username: ign })}`
    const resp = await request(url).catch((error) => {
        if (error instanceof TimeoutError) throw new LocalizedError("api.timeout", "Scrims Network API")
        if (error instanceof RequestError)
            throw new LocalizedError(`api.request_failed`, "Scrims Network API")
        throw error
    })

    const body: any = await resp.json()
    const data = body["user_data"]
    if (!data) throw new UserError(`Player by the name of '${ign}' couldn't be found!`)
    if (!data.discordId) throw new UserError(`${data.username} doesn't have their Discord account linked.`)

    return data.discordId
}
