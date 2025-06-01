import { AttachmentBuilder, MessageFlags, SlashCommandBuilder } from "discord.js"
import { SlashCommand } from "lib"
import { DateTime } from "luxon"

import { RANKS } from "@Constants"
import { UserProfile } from "@module/profiler"
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
        ),

    config: { permission: "commands.listMembers" },
    anyContext: true,

    async handler(interaction) {
        const rank = interaction.options.getString(Options.Rank, true)
        const next = Object.values(RANKS)[Object.values(RANKS).indexOf(rank) + 1]

        const users = OfflinePositions.getUsersWithPosition(rank).filter(
            (user) => !next || !OfflinePositions.hasPosition(user, next),
        )

        const content = users.map((user) => `- ${UserProfile.getUsername(user)} (${user})`).join("\n")
        const file = new AttachmentBuilder(Buffer.from(content)).setName(
            `Bridge Scrims ${rank} ${DateTime.now().toFormat("dd-MM-yyyy")}.txt`,
        )

        await interaction.reply({
            content: `### ${users.length}/${UserProfile.getIds().length} Members are ${rank} Rank`,
            files: [file],
            flags: MessageFlags.Ephemeral,
        })
    },
})
