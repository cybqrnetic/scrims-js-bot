import { MessageComponentInteraction } from "discord.js"
import { Component, LocalizedError, UserError } from "lib"
import { VouchDuelSession } from "./VouchDuelSession"

Component({
    builder: VouchDuelSession.BUTTONS.Join,
    config: { defer: "EphemeralReply" },
    async handler(interaction: MessageComponentInteraction<"cached">) {
        const startedAt = interaction.args.shift()!
        const session = VouchDuelSession.findSession(startedAt)
        if (!session) throw new UserError("This session expired.")

        if (!interaction.user.hasPermission(`council.${session.rank.toLowerCase()}.vouchDuels`)) {
            throw new LocalizedError("Insufficient Permissions")
        }

        await session.addCouncil(interaction.member.id)
        await interaction.editReply("Joined the vouch duel session.")
    },
})

Component({
    builder: VouchDuelSession.BUTTONS.Leave,
    config: { defer: "EphemeralReply" },
    async handler(interaction: MessageComponentInteraction<"cached">) {
        const startedAt = interaction.args.shift()!
        const session = VouchDuelSession.findSession(startedAt)
        if (!session) throw new UserError("This session expired.")

        await session.removeCouncil(interaction.member.id)
        await interaction.editReply("Left the vouch duel session.")
    },
})
