import { User } from "discord.js"

import { HOST_GUILD_ID, RANKS, ROLE_APP_HUB } from "@Constants"
import { Config, I18n, MessageOptionsBuilder, PositionRole, ScrimsBot, Vouch } from "lib"
import { VouchCollection } from "./VouchCollection"

const PROMOTIONS_CHANNEL = Config.declareType("Promotions Channel")

for (const rank of Object.values(RANKS)) {
    Config.declareType(`${rank} Log Channel`)
    Config.declareType(`${rank} Announcements Channel`)
    Config.declareType(`${rank} Auto Role Vouches`)
    Config.declareType(`${rank} Vouch Expiration`)
    Config.declareType(`${rank} Devouch Expiration`)
}

const PROMOTION_PREFIX: Record<string, string> = {
    Prime: "### ",
    Private: "## ",
    Premium: "# "
}

export class AutoPromoteHandler {
    static onVouched(vouch: Vouch) {
        const user = vouch.user()
        const val = ScrimsBot.INSTANCE?.getConfigValue(`${vouch.position} Auto Role Vouches`, ROLE_APP_HUB)
        const autoAt = val ? parseInt(val) : NaN

        if (autoAt && user && ScrimsBot.INSTANCE?.permissions.hasPosition(user, vouch.position) === false) {
            VouchCollection.fetch(vouch.userId, vouch.position).then(async (vouches) => {
                if (vouches.getPositiveSincePurge().length < autoAt) return

                const member = await ScrimsBot.INSTANCE?.host?.members.fetch(vouch.userId)
                if (!member) return

                const roles = PositionRole.getPermittedRoles(vouch.position, HOST_GUILD_ID)
                await Promise.all(
                    roles.map((r) =>
                        member.roles.add(r, `Promoted to ${vouch.position} by ${vouch.executor()?.tag}.`),
                    ),
                )

                ScrimsBot.INSTANCE?.buildSendMessages(`${vouch.position} Log Channel`, null, (guild) =>
                    vouches
                        .toMessage(I18n.getInstance(), {}, guild.id)
                        .setContent(
                            `**${user} was automatically given ${vouch.position} for having ${autoAt} vouches.**`,
                        ),
                )

                this.announcePromotion(member.user, vouch.position)
            })
        }
    }

    static announcePromotion(user: User, rank: string) {
        ScrimsBot.INSTANCE?.buildSendMessages(
            `${rank} Announcements Channel`,
            null,
            new MessageOptionsBuilder().setContent(
                `**${user} You are now ${rank} in Bridge Scrims.. Congrats!!**`,
            ),
        )

        ScrimsBot.INSTANCE?.buildSendMessages(
            PROMOTIONS_CHANNEL,
            null,
            new MessageOptionsBuilder().setContent(`${PROMOTION_PREFIX[rank] ?? ""}${user} has been promoted to ${rank}!`),
        )
    }
}
