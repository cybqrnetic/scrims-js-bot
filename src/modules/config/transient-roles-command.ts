import { HOST_GUILD_ID, Positions } from "@Constants"
import { Events, Role, SlashCommandBuilder } from "discord.js"
import { BotListener, SlashCommand, TransientRole } from "lib"

BotListener(Events.GuildRoleDelete, (bot, role) => TransientRole.deleteOne({ _id: role.id }))

const Options = {
    Role: "role",
    Transient: "transient",
}

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("transient-roles")
        .setDescription("Used to configure the transient roles.")
        .addSubcommand((command) =>
            command
                .setName("set")
                .setDescription("Set or unset a role as transient.")
                .addRoleOption((option) =>
                    option.setName(Options.Role).setDescription("The role to configure."),
                )
                .addBooleanOption((option) =>
                    option.setName(Options.Transient).setDescription("Whether this role is transient."),
                ),
        )
        .addSubcommand((command) => command.setName("list").setDescription("List all transient roles."))
        .setDefaultMemberPermissions("0"),

    config: { guilds: [HOST_GUILD_ID], permissions: { positionLevel: Positions.Staff } },

    async handler(interaction) {
        if (interaction.subCommandName === "set") {
            const role = interaction.options.getRole(Options.Role, true)
            const value = interaction.options.getBoolean(Options.Transient, true)

            if (!value) {
                await TransientRole.deleteOne({ _id: role.id })
                TransientRole.cache.delete(role.id)
            } else {
                const created = await TransientRole.create({ _id: role.id })
                TransientRole.cache.set(created.id, created)
            }
        }

        const roles = Array.from(TransientRole.cache.keys())
            .map((v) => interaction.guild?.roles.cache.get(v))
            .filter((v): v is Role => v !== undefined)
            .sort((a, b) => b.comparePositionTo(a))

        if (!roles.length) {
            return interaction.reply({
                content: "There are currently no transient roles configured.",
                ephemeral: true,
            })
        }

        await interaction.reply({
            content: `## Transient Roles\n${roles.map((v) => `- ${v}`).join("\n")}`,
            ephemeral: true,
        })
    },
})
