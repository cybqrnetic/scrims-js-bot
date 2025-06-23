import { RANKS } from "@Constants"
import { PositionRole } from "@module/positions"
import { Collection, SlashCommandBuilder, time, TimestampStyles } from "discord.js"
import { SlashCommand, UserError } from "lib"

const cooldowns = new Collection<string, number>()
setInterval(() => cooldowns.sweep((timestamp) => Date.now() > timestamp), 5 * 60 * 1000)

for (const rank of Object.values(RANKS)) {
    const name = rank.toLowerCase().slice(0, rank.length > 5 ? 4 : rank.length)

    const PingRoles = PositionRole.declarePositions({
        "1v1": `${rank} 1v1`,
        "2v2": `${rank} 2v2`,
        "3v3": `${rank} 3v3`,
        "4v4": `${rank} 4v4`,
        bullet: `${rank} Bullet`,
    })

    SlashCommand({
        builder: new SlashCommandBuilder()
            .setName(name)
            .setDescription("Ping a desired role upon request")
            .addStringOption((option) =>
                option
                    .setName("role")
                    .setDescription("The role you would like to mention")
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
                    .setName("text")
                    .setDescription("An optional additional text to put in the message")
                    .setRequired(false),
            ),

        config: { defer: "EphemeralReply", restricted: true, permission: `${rank}.ping` },
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

            const position = interaction.options.getString("role", true)
            const text = interaction.options.getString("text")

            const roles = PositionRole.getRoles(position, interaction.guildId)
            if (!roles.length) throw new UserError("Role Unavailable", "The specified role is not available.")

            const regex = /https?:\/\/[^\s]+|discord\.(gg|com\/invite)\/[^\s]+/gi
            const cleanedText = text?.replace(regex, "[Link Removed]") ?? ""

            await interaction.channel?.send({
                content: `${interaction.user}: ${roles.join("")} ${cleanedText}`,
                allowedMentions: { roles: roles.map((r) => r.id) },
            })

            await interaction.editReply("Ping sent!")
        },
    })
}
