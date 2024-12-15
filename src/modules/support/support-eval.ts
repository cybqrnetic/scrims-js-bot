import { AlignmentEnum, AsciiTable3 } from "ascii-table3"
import { SlashCommandBuilder } from "discord.js"
import { MessageOptionsBuilder, SlashCommand, TimeUtil, UserError } from "lib"

import { OnlinePositions, Positions } from "@module/positions"
import { Ticket } from "@module/tickets"

const Options = {
    Expiration: "time-period",
}

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("support-eval")
        .setDescription("Generate a support validation.")
        .addStringOption((o) =>
            o
                .setName(Options.Expiration)
                .setDescription(
                    "The time period to consider (e.g. 30d, 3months or 1y). [Default: no restrictions]",
                )
                .setRequired(false),
        ),

    config: {
        defer: "ephemeral_reply",
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

        const tickets = await Ticket.find({ deletedAt: { $exists: true } }).then((v) =>
            v.filter((v) => v.createdAt > expiration || v.deletedAt! > expiration),
        )

        const stats = new AsciiTable3("Support Eval")
            .setHeading("User", "Tickets Closed")
            .setAligns([AlignmentEnum.CENTER, AlignmentEnum.CENTER, AlignmentEnum.CENTER])
            .addRowMatrix(support.map((m) => [m.user.tag, tickets.filter((t) => t.closerId === m.id).length]))

        await interaction.editReply(new MessageOptionsBuilder().setContent("```\n" + stats + "```"))
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
