import { MAIN_GUILD_ID, RANKS } from "@Constants"
import { Collection, SlashCommandBuilder, time, TimestampStyles } from "discord.js"
import { SlashCommand, UserError } from "lib"

const cooldowns = new Collection<string, number>()
setInterval(() => cooldowns.sweep((timestamp) => Date.now() > timestamp), 5 * 60 * 1000)

for (const rank of Object.values(RANKS)) {
    const name = rank.toLowerCase().slice(0, rank.length > 5 ? 4 : rank.length)

    const Options = {
        Role: "role",
        Text: "text",
    }

    const PingRoles = {
        "1v1": `${rank} 1v1`,
        "2v2": `${rank} 2v2`,
        "3v3": `${rank} 3v3`,
        "4v4": `${rank} 4v4`,
        bullet: `${rank} Bullet Tourneys`,
    }

    SlashCommand({
        builder: new SlashCommandBuilder()
            .setName(name)
            .setDescription("Ping a desired role upon request.")
            .addStringOption((option) =>
                option
                    .setName(Options.Role)
                    .setDescription("The role you would like to mention.")
                    .setRequired(true)
                    .addChoices(
                        Object.entries(PingRoles).map(([name, value]) => ({
                            name,
                            value,
                        })),
                    ),
            )
            .addStringOption((option) =>
                option
                    .setName(Options.Text)
                    .setDescription("An optional additional text to put in the message.")
                    .setRequired(false),
            ),

        config: {
            defer: "EphemeralReply",
            guilds: [MAIN_GUILD_ID],
            permission: `${rank}.ping`,
        },

        async handler(interaction) {
            const cooldownKey = `${interaction.user.id}-${rank}`
            const activeCooldown = cooldowns.get(cooldownKey) ?? 0

            if (activeCooldown > Date.now()) {
                const timestamp = time(Math.ceil(activeCooldown / 1000), TimestampStyles.RelativeTime)
                throw new UserError(
                    "Cooldown",
                    `You are on cooldown. You can use this command again ${timestamp}.`,
                )
            }

            cooldowns.set(cooldownKey, Date.now() + 60 * 1000)

            const roleName = interaction.options.getString(Options.Role, true)
            const text = interaction.options.getString(Options.Text)

            const role = interaction.guild.roles.cache.find((r) => r.name === roleName)
            if (!role) throw new UserError("Role Unavailable", "The specified role is not available.")

            const regex = /https?:\/\/[^\s]+|discord\.(gg|com\/invite)\/[^\s]+/gi
            const cleanedText = text?.replaceAll(regex, "[Link Removed]") ?? ""

            await interaction.channel?.send({
                content: `${interaction.user}: ${role} ${cleanedText}`,
                allowedMentions: { roles: [role.id] },
            })

            await interaction.editReply("Ping sent!")
        },
    })
}
