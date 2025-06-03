import { Colors } from "@Constants"
import { PositionRole } from "@module/positions"
import {
    ApplicationCommandPermissionType,
    ApplicationCommandType,
    chatInputApplicationCommandMention,
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
                        `Run the command again with the token from the following OAuth2 link: ` +
                            `[Authorize URL](https://discord.com/oauth2/authorize?${params})`,
                        Colors.NiceBlue,
                    )
                    .setEphemeral(true),
            )
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        const updates: string[] = []
        await Promise.all(
            interaction.guild.commands.cache.map(async (command) => {
                const config = commands.getConfig(command.name)
                if (config?.permission) {
                    const hostRoles = new Set(
                        RolePermissions.cache
                            .filter((v) => v.permissions.includes(config.permission!))
                            .map((v) => v._id),
                    )

                    const positions = Array.from(
                        new Set(
                            PositionRole.cache.filter((v) => hostRoles.has(v.roleId)).map((v) => v.position),
                        ),
                    )

                    const roles = Array.from(
                        new Set(
                            positions.flatMap((position) =>
                                PositionRole.getRoles(position, interaction.guild.id),
                            ),
                        ),
                    )

                    const mention =
                        command.type === ApplicationCommandType.ChatInput
                            ? chatInputApplicationCommandMention(command.name, command.id)
                            : inlineCode(command.name)

                    updates.push(`- ${mention} -> ${roles.join(" ")}`)
                    await interaction.guild.commands.permissions.set({
                        token,
                        command: command.id,
                        permissions: roles.map((role) => ({
                            id: role.id,
                            type: ApplicationCommandPermissionType.Role,
                            permission: true,
                        })),
                    })
                }
            }),
        )

        await interaction.editReply(
            new MessageOptionsBuilder().setContainerContent(
                `### Command permissions set:\n${updates.join("\n")}`,
                Colors.BrightSeaGreen,
            ),
        )
    },
})
