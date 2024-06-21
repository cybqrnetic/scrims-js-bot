import { EmbedField, Role, User, userMention } from "discord.js"
import { DateTime } from "luxon"

import { RANKS } from "@Constants"
import { I18n, ScrimsBot, UserError, UserProfile, Vouch } from "lib"

export class VouchUtil {
    static toEmbedField(vouch: Vouch, i18n: I18n, councilRole?: Role, idx?: number) {
        const givenAt = vouch.givenAt.toDiscord("D")

        if (vouch.executorId) {
            return i18n.getObject(
                "vouches.to_field." +
                    (!vouch.isPositive() ? "negative" : vouch.isExpired() ? "expired" : "positive"),
                userMention(vouch.executorId),
                vouch.comment,
                vouch.executor()?.username ?? UserProfile.getUsername(vouch.executorId) ?? "Unknown User",
                givenAt,
                idx || undefined,
            ) as EmbedField
        }

        return i18n.getObject(
            "vouches.to_field." + (vouch.isPositive() ? "accepted" : vouch.isPurge() ? "purged" : "denied"),
            councilRole ? `${councilRole}` : `council`,
            vouch.comment,
            givenAt,
            idx || undefined,
        ) as EmbedField
    }

    static toString(vouch: Vouch, i18n: I18n, idx?: number) {
        if (vouch.executorId) {
            return i18n.get(
                "vouches.as_string." + (vouch.isPositive() ? "positive" : "negative"),
                idx,
                vouch.executor()?.username ?? UserProfile.getUsername(vouch.executorId) ?? "Unknown User",
                vouch.comment,
            )
        }

        return i18n.get(
            "vouches.as_string." + (vouch.isPositive() ? "accepted" : vouch.isPurge() ? "purged" : "denied"),
            idx,
            vouch.comment,
        )
    }

    static determineVouchRank(user: User, rankOverride: string | null, council?: User) {
        if (rankOverride) return this.checkVouchPermissions(user, rankOverride, council)

        let previous = null
        for (const rank of Object.values(RANKS).reverse().concat("Member")) {
            if (rank === "Member" || ScrimsBot.INSTANCE?.permissions.hasPosition(user, rank)) {
                return this.checkVouchPermissions(user, previous ?? rank, council)
            }
            previous = rank
        }

        throw new Error("Impossible")
    }

    static checkVouchPermissions(user: User, rank: string, council?: User) {
        if (council && !ScrimsBot.INSTANCE?.permissions.hasPosition(council, `${rank} Council`))
            throw new UserError(`You are missing the required permission to give ${user} a ${rank} vouch.`)
        return rank
    }

    static determineDemoteRank(user: User | UserProfile, council: User) {
        for (const rank of Object.values(RANKS).reverse()) {
            if (ScrimsBot.INSTANCE?.permissions.hasPosition(user, rank)) {
                if (!ScrimsBot.INSTANCE?.permissions.hasPosition(council, `${rank} Head`))
                    throw new UserError(
                        `You are missing the required permission to demote ${user} from ${rank}.`,
                    )
                return rank
            }
        }
        throw new UserError(`You can't demote ${user} since they only have the default rank of member.`)
    }

    static async removeSimilarVouches(vouch: Vouch) {
        await Vouch.deleteMany({
            userId: vouch.userId,
            executorId: vouch.executorId,
            position: vouch.position,
            givenAt: { $lte: DateTime.now().plus({ days: 7 }).toJSDate() },
            _id: { $ne: vouch._id },
            ...(vouch.isVoteOutcome() && { worth: vouch.worth }),
        })
    }
}
