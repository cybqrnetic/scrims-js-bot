import { EmbedField, Role, User, userMention, type CommandInteraction } from "discord.js"
import { getMainGuild, I18n } from "lib"

import { RANKS } from "@Constants"
import { OnlinePositions } from "@module/positions"
import { UserProfile } from "@module/profiler"
import { OfflinePositions } from "@module/sticky-roles"
import { Vouch } from "./Vouch"
import { VouchCollection } from "./VouchCollection"

export class VouchUtil {
    static toEmbedField(vouch: Vouch, i18n: I18n, councilRole?: Role, idx?: number): EmbedField {
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
            )
        }

        return i18n.getObject(
            "vouches.to_field." + (vouch.isPositive() ? "accepted" : vouch.isPurge() ? "purged" : "denied"),
            councilRole ? `${councilRole}` : `council`,
            vouch.comment,
            givenAt,
            idx || undefined,
        )
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

    static determineVouchRank(user: User) {
        let previous = null
        for (const rank of Object.values(RANKS).reverse()) {
            if (OfflinePositions.hasPosition(user, rank)) {
                return previous ?? rank
            }
            previous = rank
        }

        return previous as string
    }

    static async finishVouchesInteraction(
        interaction: CommandInteraction,
        user: User,
        rank: string,
        includeExpired?: boolean,
    ) {
        const guildId = interaction.guildId ?? undefined
        const [vouches] = await Promise.all([
            VouchCollection.fetch(user.id, rank),
            getMainGuild()?.members.fetch({ user: interaction.user.id, force: true }),
        ])

        if (includeExpired === undefined) {
            includeExpired = OnlinePositions.hasPosition(interaction.user, rank)
        }

        await interaction.editReply(
            vouches.toMessage(interaction.i18n, { includeExpired }, guildId).setAllowedMentions(),
        )

        if (!vouches.getCovered().length) return

        if (interaction.user.id === user.id) {
            vouches.vouches.forEach((v) => (v.comment = undefined))
        } else if (!OnlinePositions.hasPosition(interaction.user, `${rank} Council`)) {
            return
        }

        await interaction.followUp(
            vouches
                .toMessage(interaction.i18n, { onlyHidden: true }, guildId)
                .setAllowedMentions()
                .setEphemeral(true),
        )
    }
}
