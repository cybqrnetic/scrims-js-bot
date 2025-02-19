import { AttachmentBuilder, InteractionContextType, SlashCommandBuilder } from "discord.js"
import { SlashCommand, UserProfile } from "lib"
import { DateTime } from "luxon"

import { RANKS } from "@Constants"
import { OfflinePositions } from "@module/sticky-roles"

const Options = { Rank: "rank" }

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("list-members")
        .setDescription("List members with a certain rank.")
        .addStringOption((option) =>
            option
                .setName(Options.Rank)
                .setDescription("The rank to list the members of.")
                .setChoices(Object.values(RANKS).map((v) => ({ name: v, value: v })))
                .setRequired(true),
        )
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions("0"),

    config: { permission: "commands.listMembers" },

    async handler(interaction) {
        const rank = interaction.options.getString(Options.Rank, true)
        const next = Object.values(RANKS)[Object.values(RANKS).indexOf(rank) + 1]

        const users = OfflinePositions.getUsersWithPosition(rank).filter(
            (user) => !next || !OfflinePositions.hasPosition(user, next),
        )

        const content = users.map((user) => `- ${user.username} (${user.id})`).join("\n")
        const file = new AttachmentBuilder(Buffer.from(content)).setName(
            `Bridge Scrims ${rank} ${DateTime.now().toFormat("dd-MM-yyyy")}.txt`,
        )

        await interaction.reply({
            content: `### ${users.length}/${UserProfile.cache.size} Members are ${rank} Rank`,
            files: [file],
            ephemeral: true,
        })
    },
})
