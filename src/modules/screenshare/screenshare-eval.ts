import { AlignmentEnum, AsciiTable3 } from "ascii-table3"
import { codeBlock, SlashCommandBuilder } from "discord.js"
import { SlashCommand, TimeUtil, UserError } from "lib"

import { OnlinePositions, Positions } from "@module/positions"
import { Ticket } from "@module/tickets"
import { SS_TICKETS } from "./screenshare-command"

const Options = {
    Expiration: "time-period",
}

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("screenshare-eval")
        .setDescription("Generate a screenshare validation.")
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
        permission: "screenshare.evaluation",
        restricted: true,
    },

    async handler(interaction) {
        const expiration = resolveExpiration(interaction.options.getString(Options.Expiration))
        const screensharers = OnlinePositions.getMembersWithPosition(Positions.Screenshare)

        if (!screensharers || screensharers.size < 1) {
            throw new UserError(
                "Invalid Configuration",
                "The Bridge Scrims screenshare team is not configured correctly.",
            )
        }

        const tickets = await Ticket.find({ deletedAt: { $exists: true }, type: SS_TICKETS.type })
        const filtered = tickets.filter((v) => v.createdAt > expiration || v.deletedAt! > expiration)

        const stats = new AsciiTable3("Screenshare Eval")
            .setHeading("User", "Tickets Closed")
            .setAligns([AlignmentEnum.CENTER, AlignmentEnum.CENTER, AlignmentEnum.CENTER])
            .addRowMatrix(
                screensharers.map((m) => [m.user.tag, filtered.filter((t) => t.closerId === m.id).length]),
            )
            .toString()

        await interaction.editReply({ content: codeBlock(stats) })
    },
})

function resolveExpiration(expiration: string | null) {
    if (expiration) {
        const duration = TimeUtil.parseDuration(expiration)
        if (!duration || duration < 0) {
            throw new UserError(
                "Invalid Time Period",
                "Please input a valid time period like 30d, 1month or 5y and try again.",
            )
        }

        return new Date(Date.now() - duration * 1000)
    }

    return 0
}
