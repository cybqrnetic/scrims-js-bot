import { Colors, RankedStats } from "@Constants"
import {
    bold,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    inlineCode,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    userMention,
} from "discord.js"
import { MessageOptionsBuilder, SlashCommand, UserError, UserProfile } from "lib"

const NAME = "ranked-leaderboard"
const PAGE = 15

const Types = {
    Elo: "ELO",
    Wins: "Wins",
    BestStreak: "Best Win Streak",
}

const Fields = {
    [Types.Elo]: RankedStats.Elo,
    [Types.Wins]: RankedStats.Wins,
    [Types.BestStreak]: RankedStats.BestStreak,
}

async function getLeaderboard(type: string, page: number) {
    const skip = (page - 1) * PAGE
    const field = Fields[type]!
    const leaderboard = await UserProfile.find(
        { [field]: { $exists: true } },
        { [field]: 1 },
        { sort: { [field]: -1 }, skip: skip, limit: PAGE + 1 },
    )

    if (!leaderboard.length) throw new UserError(`No players found on page ${page}.`)

    const embed = new EmbedBuilder()
        .setTitle(`Ranked Leaderboard | ${type}`)
        .setColor(Colors.NiceBlue)
        .setFooter({ text: `Page ${page}` })
        .setTimestamp()

    const split = field.split(".")
    embed.setDescription(
        leaderboard
            .slice(0, PAGE)
            .map((v, i) => {
                const val = split.reduce((pv, cv) => pv[cv], v as any)
                return `${bold(`${i + 1 + skip}.`)} ${userMention(v.id)} ${inlineCode(val)}`
            })
            .join("\n"),
    )

    return new MessageOptionsBuilder()
        .addEmbeds(embed)
        .addActions(
            new StringSelectMenuBuilder()
                .setCustomId(`${NAME}/${page}`)
                .setMinValues(1)
                .setMaxValues(1)
                .setOptions(Object.values(Types).map((v) => ({ label: v, value: v, default: v === type }))),
        )
        .addButtons(
            new ButtonBuilder()
                .setCustomId(`${NAME}/${type}/${page - 1}`)
                .setLabel("Previous Page")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 1),
            new ButtonBuilder()
                .setCustomId(`${NAME}/${type}/${page + 1}`)
                .setLabel("Next Page")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(leaderboard.length <= PAGE),
        )
}

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName(NAME)
        .setDescription("Displays the current Ranked Bridge leaderboard.")
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("The type of leaderboard to display")
                .setChoices(Object.values(Types).map((v) => ({ name: v, value: v })))
                .setRequired(false),
        )
        .addIntegerOption((option) =>
            option
                .setName("-page")
                .setDescription("The page of the leaderboard to display")
                .setMinValue(1)
                .setRequired(false),
        ),

    anyContext: true,
    userInstall: true,

    async handler(interaction) {
        const type = interaction.options.getString("type") ?? Types.Elo
        const page = interaction.options.getInteger("page") ?? 1

        const leaderboard = await getLeaderboard(type, page)
        await interaction.reply(leaderboard)
    },

    async handleComponent(interaction) {
        if (interaction.message.interactionMetadata?.user.id !== interaction.user.id) {
            throw new UserError(
                "You can't edit this leaderboard. " +
                    "Create your own leaderboard with the /leaderboard command.",
            )
        }

        if (interaction.isButton()) {
            const type = interaction.args.shift()!
            const page = parseInt(interaction.args.shift()!)
            const leaderboard = await getLeaderboard(type, page)
            await interaction.update(leaderboard)
        } else if (interaction.isStringSelectMenu()) {
            const type = interaction.values[0]!
            const page = parseInt(interaction.args.shift()!)
            const leaderboard = await getLeaderboard(type, page)
            await interaction.update(leaderboard)
        }
    },
})
