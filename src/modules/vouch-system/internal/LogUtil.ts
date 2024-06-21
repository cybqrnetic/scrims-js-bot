import { User, userMention } from "discord.js"
import {
    Config,
    DiscordUtil,
    I18n,
    MessageOptionsBuilder,
    PositionRole,
    ScrimsBot,
    UserProfile,
    Vouch,
} from "lib"

import { Colors, RANKS } from "@Constants"
import { VouchUtil } from "../VouchUtil"

Object.values(RANKS).forEach((rank) => {
    Config.declareType(`${rank} Vouch Log Channel`)
})

const Emojis = {
    Devouch: ":no_entry:",
    Vouch: ":white_check_mark:",
    Accepted: ":ballot_box_with_check:",
    Denied: ":x:",
    Purge: ":flag_white:",
}

export default class LogUtil {
    static async logDelete(vouch: Vouch, executor: User) {
        await ScrimsBot.INSTANCE?.buildSendLogMessages(
            `${vouch.position} Vouch Log Channel`,
            null,
            (guild) => {
                return new MessageOptionsBuilder()
                    .addEmbeds((e) =>
                        e
                            .setAuthor(DiscordUtil.userAsEmbedAuthor(executor))
                            .setColor(Colors.BeanRed)
                            .setDescription(
                                `*Removed the following vouch from ${userMention(vouch.userId)}:*`,
                            )
                            .addFields(
                                VouchUtil.toEmbedField(
                                    vouch,
                                    I18n.getInstance(),
                                    PositionRole.getRoles(`${vouch.position} Council`, guild.id)[0],
                                ),
                            ),
                    )
                    .setContent([executor, userMention(vouch.userId)].filter((v) => v).join(" "))
            },
        )
    }

    static async logCreate(vouch: Vouch, _executor?: User) {
        const user = userMention(vouch.userId)
        const executor = vouch.executorId
            ? userMention(vouch.executorId)
            : `${_executor || ScrimsBot.INSTANCE?.user}`
        const reason = vouch.comment ? ` for *${vouch.comment}*` : ""

        const msg = vouch.isPurge()
            ? `${Emojis.Purge} ${executor} purged ${user}${reason}.`
            : vouch.isVoteOutcome()
              ? vouch.isPositive()
                  ? `${Emojis.Accepted} ${executor} accepted ${user} application.`
                  : `${Emojis.Denied} ${executor} denied ${user} application.`
              : !vouch.isPositive()
                ? `${Emojis.Devouch} ${executor} devouched ${user}${reason}.`
                : `${Emojis.Vouch} ${executor} vouched ${user}${reason}.`

        return ScrimsBot.INSTANCE?.buildSendLogMessages(`${vouch.position} Vouch Log Channel`, null, () => {
            return new MessageOptionsBuilder().setContent(msg)
        })
    }

    static async logPromotion(user: string, rank: string, executor: User) {
        return ScrimsBot.INSTANCE?.buildSendLogMessages("Positions Log Channel", null, () => {
            return new MessageOptionsBuilder().setContent(
                `:mortar_board:  ${userMention(user)} was promoted to ${rank} by ${executor}.`,
            )
        })
    }

    static async logDemotion(user: User | UserProfile, rank: string, executor: User) {
        return ScrimsBot.INSTANCE?.buildSendLogMessages("Positions Log Channel", null, () => {
            return new MessageOptionsBuilder().setContent(
                `:flag_white:  ${user} was demoted from ${rank} by ${executor}.`,
            )
        })
    }
}
