import { DEFAULT_ELO, RANKED_SEASON } from "@Constants"
import {
    ApplicationCommandType,
    ContextMenuCommandBuilder,
    EmbedBuilder,
    SlashCommandBuilder,
    type CommandInteraction,
    type ContextMenuCommandType,
    type User,
} from "discord.js"
import { ContextMenu, DiscordUtil, SlashCommand, UserError, UserProfile } from "lib"

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("ranked-stats")
        .setDescription("Shows you the Ranked Bridge stats of a user.")
        .addUserOption((option) =>
            option.setName("user").setDescription("The user to show stats for").setRequired(false),
        ),

    anyContext: true,
    userInstall: true,

    async handler(interaction) {
        const user = interaction.options.getUser("user") ?? interaction.user
        await execute(interaction, user)
    },
})

ContextMenu({
    builder: new ContextMenuCommandBuilder()
        .setName("Ranked Stats")
        .setType(ApplicationCommandType.User as ContextMenuCommandType),

    anyContext: true,
    userInstall: true,

    async handler(interaction) {
        if (!interaction.isUserContextMenuCommand()) return
        await execute(interaction, interaction.targetUser)
    },
})

async function execute(interaction: CommandInteraction, user: User) {
    const player = await UserProfile.findById(user.id, { mcUUID: 1, ranked: 1 })
    if (!player?.mcUUID) {
        throw new UserError(`${user} is not registered for ranked. Use the /register command to register.`)
    }

    const stats = player.ranked?.[RANKED_SEASON] ?? {}
    const wins = stats.wins ?? 0
    const losses = stats.losses ?? 0
    const draws = stats.draws ?? 0
    const games = wins + losses + draws

    const embed = new EmbedBuilder()
        .setAuthor(DiscordUtil.userAsEmbedAuthor(user))
        .setThumbnail(`https://mc-heads.net/head/${player.mcUUID}/left`)
        .setTitle(`Ranked Stats | ${RANKED_SEASON}`)
        .setColor(user.accentColor ?? null)
        .addFields(
            { name: "ELO", value: `${stats.elo ?? DEFAULT_ELO}`, inline: true },
            { name: "Winstreak", value: `${stats.winStreak ?? 0}`, inline: true },
            { name: "Best WS", value: `${stats.bestWinStreak ?? 0}`, inline: true },
            { name: "Wins", value: `${wins}`, inline: true },
            { name: "Losses", value: `${losses}`, inline: true },
            { name: "W/L", value: `${(wins / (losses || 1)).toFixed(2)}`, inline: true },
            { name: "Win Rate", value: `${((wins / (games || 1)) * 100).toFixed()}%`, inline: true },
            { name: "Draws", value: `${draws}`, inline: true },
            { name: "Games", value: `${games}`, inline: true },
        )

    await interaction.reply({ embeds: [embed] })
}
