import { User, userMention } from "discord.js"
import { DiscordBot, DiscordUtil, I18n, MessageOptionsBuilder, UserProfile } from "lib"

import { Colors, Emojis, RANKS } from "@Constants"
import { Config } from "@module/config"
import { PositionRole } from "@module/positions"
import { Vouch, VouchUtil } from "@module/vouch-system"

Object.values(RANKS).forEach((rank) => {
    Config.declareType(`${rank} Vouch Log Channel`)
})

const Symbols = {
    Devouch: Emojis.no_entry,
    Vouch: Emojis.white_check_mark,
    Accepted: Emojis.ballot_box_with_check,
    Denied: Emojis.x,
    Purge: Emojis.flag_white,
}

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
    Premium: "# ",
}

export class LogUtil {
    static async logDelete(vouch: Vouch, executor: User) {
        await Config.buildSendLogMessages(`${vouch.position} Vouch Log Channel`, null, (guild) => {
            return new MessageOptionsBuilder()
                .addEmbeds((e) =>
                    e
                        .setAuthor(DiscordUtil.userAsEmbedAuthor(executor))
                        .setColor(Colors.BeanRed)
                        .setDescription(`*Removed the following vouch from ${userMention(vouch.userId)}:*`)
                        .addFields(
                            VouchUtil.toEmbedField(
                                vouch,
                                I18n.getInstance(),
                                PositionRole.getRoles(`${vouch.position} Council`, guild.id)[0],
                            ),
                        ),
                )
                .setContent([executor, userMention(vouch.userId)].filter((v) => v).join(" "))
        })
    }

    static async logCreate(vouch: Vouch, _executor?: User) {
        const user = userMention(vouch.userId)
        const executor = vouch.executorId
            ? userMention(vouch.executorId)
            : `${_executor || DiscordBot.INSTANCE?.user}`
        const reason = vouch.comment ? ` for *${vouch.comment}*` : ""

        const msg = vouch.isPurge()
            ? `${Symbols.Purge} ${executor} purged ${user}${reason}.`
            : vouch.isVoteOutcome()
              ? vouch.isPositive()
                  ? `${Symbols.Accepted} ${executor} accepted ${user} application.`
                  : `${Symbols.Denied} ${executor} denied ${user} application.`
              : !vouch.isPositive()
                ? `${Symbols.Devouch} ${executor} devouched ${user}${reason}.`
                : `${Symbols.Vouch} ${executor} vouched ${user}${reason}.`

        return Config.buildSendLogMessages(`${vouch.position} Vouch Log Channel`, null, () => {
            return new MessageOptionsBuilder().setContent(msg)
        })
    }

    static async logPromotion(user: string, rank: string, executor: User) {
        return Config.buildSendLogMessages("Positions Log Channel", null, () => {
            return new MessageOptionsBuilder().setContent(
                `:mortar_board:  ${userMention(user)} was promoted to ${rank} by ${executor}.`,
            )
        })
    }

    static async logDemotion(user: User | UserProfile, rank: string, executor: User) {
        return Config.buildSendLogMessages("Positions Log Channel", null, () => {
            return new MessageOptionsBuilder().setContent(
                `:flag_white:  ${user} was demoted from ${rank} by ${executor}.`,
            )
        })
    }

    static announcePromotion(user: User, rank: string) {
        Config.buildSendMessages(
            `${rank} Announcements Channel`,
            null,
            new MessageOptionsBuilder().setContent(
                `**${user} You are now ${rank} in Bridge Scrims.. Congrats!!**`,
            ),
        )

        Config.buildSendMessages(
            PROMOTIONS_CHANNEL,
            null,
            new MessageOptionsBuilder().setContent(
                `${PROMOTION_PREFIX[rank] ?? ""}${user} has been promoted to ${rank}!`,
            ),
        )
    }
}
