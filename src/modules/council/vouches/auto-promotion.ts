import { getMainGuild, I18n } from "lib"

import { MAIN_GUILD_ID, ROLE_APP_HUB } from "@Constants"
import { Config } from "@module/config"
import { OnlinePositions, PositionRole } from "@module/positions"
import { Vouch, VouchCollection } from "@module/vouch-system"
import { LogUtil } from "./LogUtil"

Vouch.onUpdate(async (vouch) => {
    if (!vouch.isPositive()) return

    const user = vouch.user()
    const val = Config.getConfigValue(`${vouch.position} Auto Role Vouches`, ROLE_APP_HUB)
    const autoAt = val ? parseInt(val) : NaN

    if (autoAt && user && OnlinePositions.hasPosition(user, vouch.position) === false) {
        const vouches = await VouchCollection.fetch(vouch.userId, vouch.position)
        if (vouches.getPositiveSincePurge().length < autoAt) return

        const member = await getMainGuild()?.members.fetch(vouch.userId)
        if (!member) return

        const roles = PositionRole.getPermittedRoles(vouch.position, MAIN_GUILD_ID)
        await Promise.all(
            roles.map((r) =>
                member.roles.add(r, `Promoted to ${vouch.position} by ${vouch.executor()?.tag}.`),
            ),
        )

        Config.buildSendMessages(`${vouch.position} Log Channel`, null, (guild) =>
            vouches
                .toMessage(I18n.getInstance(), {}, guild.id)
                .setContent(
                    `**${user} was automatically given ${vouch.position} for having ${autoAt} vouches.**`,
                ),
        )

        LogUtil.announcePromotion(member.user, vouch.position)
    }
})
