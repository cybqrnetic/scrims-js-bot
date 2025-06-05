import { Colors } from "@Constants"
import { PositionRole } from "@module/positions"
import {
    ApplicationCommandPermissionType,
    ApplicationCommandType,
    chatInputApplicationCommandMention,
    Guild,
    inlineCode,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js"
import { commands, MessageOptionsBuilder, SlashCommand } from "lib"
import { RolePermissions } from "./RolePermissions"

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("command-permissions")
        .setDescription("Set command permissions.")
        .addStringOption((option) =>
            option
                .setName("token")
                .setDescription("The OAuth2 token to use for setting permissions.")
                .setRequired(false),
        )
        .setDefaultMemberPermissions("0"),

    async handler(interaction) {
        const commands = getCommandRoles(interaction.guild)

        const token = interaction.options.getString("token")
        if (!token) {
            const params = new URLSearchParams({
                client_id: interaction.client.application.id,
                response_type: "token",
                redirect_uri: "http://10.80.31.1:4012",
                scope: "applications.commands.permissions.update",
            })

            return interaction.reply(
                new MessageOptionsBuilder()
                    .setContainerContent(
                        `### Command Permissions\nRun the command again with the token from this ` +
                            `[Authorization URL](https://discord.com/oauth2/authorize?${params}) ` +
                            `to set the command permissions to the following:\n` +
                            commands
                                .map(({ command, roles }) => {
                                    const mention =
                                        command.type === ApplicationCommandType.ChatInput
                                            ? chatInputApplicationCommandMention(command.name, command.id)
                                            : inlineCode(command.name)

                                    return `- ${mention} -> ${roles.join(" ")}`
                                })
                                .reduce((pv, cv) => `${pv}\n${cv}`, ""),
                        Colors.NiceBlue,
                    )
                    .setEphemeral(true),
            )
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        await Promise.all(
            commands.map(({ command, roles }) =>
                interaction.guild.commands.permissions.set({
                    token,
                    command: command.id,
                    permissions: roles.map((role) => ({
                        id: role.id,
                        type: ApplicationCommandPermissionType.Role,
                        permission: true,
                    })),
                }),
            ),
        )

        await interaction.editReply(
            new MessageOptionsBuilder().setContainerContent(
                `Command permissions set.`,
                Colors.BrightSeaGreen,
            ),
        )
    },
})

function* getCommandRoles(guild: Guild) {
    for (const command of guild.client.application.commands.cache.concat(guild.commands.cache).values()) {
        const config = commands.getConfig(command.name)
        if (config?.permission) {
            const hostRoles = new Set(
                RolePermissions.cache
                    .filter((v) => v.permissions.includes(config.permission!))
                    .map((v) => v._id),
            )

            const positions = Array.from(
                new Set(PositionRole.cache.filter((v) => hostRoles.has(v.roleId)).map((v) => v.position)),
            )

            const roles = Array.from(
                new Set(positions.flatMap((position) => PositionRole.getRoles(position, guild.id))),
            )

            yield { command, roles }
        }

        yield { command, roles: [] }
    }
}
