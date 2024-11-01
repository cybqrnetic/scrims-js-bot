import { COUNCIL_PERMISSIONS } from "@Constants"
import { Component, UserError } from "lib"
import { VouchDuelSession } from "./VouchDuelSession"

Component({
    builder: VouchDuelSession.buttonIds.join,
    config: { permissions: COUNCIL_PERMISSIONS, defer: "ephemeral_reply" },
    async handler(interaction) {
        const startedAt = interaction.args.shift()!
        const session = VouchDuelSession.findSession(startedAt)
        if (!session) throw new UserError("This session expired.")

        await session.addCouncil(interaction.member.id)
        await interaction.editReply("Joined the vouch duel session.")
    },
})

Component({
    builder: VouchDuelSession.buttonIds.leave,
    config: { permissions: COUNCIL_PERMISSIONS, defer: "ephemeral_reply" },
    async handler(interaction) {
        const startedAt = interaction.args.shift()!
        const session = VouchDuelSession.findSession(startedAt)
        if (!session) throw new UserError("This session expired.")

        await session.removeCouncil(interaction.member.id)
        await interaction.editReply("Left the vouch duel session.")
    },
})
