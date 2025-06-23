import { AlignmentEnum, AsciiTable3 } from "ascii-table3"
import { codeBlock, SlashCommandBuilder } from "discord.js"
import { SlashCommand, TimeUtil, UserError } from "lib"

import { OnlinePositions, Positions } from "@module/positions"
import { Ticket } from "@module/tickets"
import { reportHandler, supportHandler } from "./support-tickets"

const Options = {
    Expiration: "time-period",
}

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("support-eval")
        .setDescription("Generate a support validation.")
        .addStringOption((option) =>
            option
                .setName(Options.Expiration)
                .setDescription(
                    "The time period to consider (e.g. 30d, 3months or 1y). [Default: no restrictions]",
                )
                .setRequired(false),
        ),

    config: {
        defer: "EphemeralReply",
        permission: "support.evaluation",
        restricted: true,
    },

    async handler(interaction) {
        const expiration = resolveExpiration(interaction.options.getString(Options.Expiration))
        const support = OnlinePositions.getMembersWithPosition(Positions.Support)

        if (!support || support.size < 1)
            throw new UserError(
                "Invalid Support Team",
                "The Bridge Scrims support team could not be identified.",
            )

        const tickets = await Ticket.find({
            deletedAt: { $exists: true },
            type: { $in: [supportHandler.tickets.type, reportHandler.tickets.type] },
        }).then((v) => v.filter((v) => v.createdAt > expiration || v.deletedAt! > expiration))

        const stats = new AsciiTable3("Support Eval")
            .setHeading("User", "Tickets Closed")
            .setAligns([AlignmentEnum.CENTER, AlignmentEnum.CENTER, AlignmentEnum.CENTER])
            .addRowMatrix(support.map((m) => [m.user.tag, tickets.filter((t) => t.closerId === m.id).length]))
            .toString()

        await interaction.editReply({ content: codeBlock(stats) })
    },
})

function resolveExpiration(expiration: string | null) {
    if (expiration) {
        const duration = TimeUtil.parseDuration(expiration)
        if (!duration || duration < 0)
            throw new UserError(
                "Invalid Time Period",
                "Please input a valid time period like 30d, 1month or 5y and try again.",
            )
        return new Date(Date.now() - duration * 1000)
    }
    return 0
}
