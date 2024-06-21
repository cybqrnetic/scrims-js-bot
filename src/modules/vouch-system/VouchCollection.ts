import { EmbedField, StringSelectMenuBuilder, userMention } from "discord.js"
import {
    ColorUtil,
    I18n,
    LocalizedError,
    MessageOptionsBuilder,
    PositionRole,
    ScrimsBot,
    TextUtil,
    TimeUtil,
    Vouch,
} from "lib"

import { VouchUtil } from "./VouchUtil"

interface VouchMessageOptions {
    includeHidden?: boolean
    includeExpired?: boolean
    onlyHidden?: boolean
    withIndex?: boolean
}

export class VouchCollection {
    static async fetch(userId: string, position: string) {
        const vouches = await Vouch.find({ userId, position })
        return new VouchCollection(userId, position, vouches)
    }

    constructor(
        readonly userId: string,
        readonly position: string,
        readonly vouches: Vouch[],
    ) {
        this.vouches = this.vouches.sort((a, b) => b.givenAt.valueOf() - a.givenAt.valueOf())
    }

    get user() {
        return ScrimsBot.INSTANCE?.users?.resolve(this.userId) ?? null
    }

    get size() {
        return this.get().length
    }

    get ovw() {
        return this.get().reduce((pv, cv) => pv + cv.worth, 0)
    }

    get() {
        return this.vouches.filter((v) => !v.isExpired())
    }

    getExpired() {
        return this.vouches.filter((v) => !v.isVoteOutcome() && v.isPositive() && v.isExpired())
    }

    getExposed() {
        return this.get().filter((v) => !v.isHidden())
    }

    getPositive() {
        return this.get().filter((v) => !v.isVoteOutcome() && v.isPositive())
    }

    getPositiveSincePurge() {
        const index = this.get().findIndex((v) => v.isPurge())
        return this.get()
            .slice(0, index === -1 ? this.size : index)
            .filter((v) => !v.isVoteOutcome() && v.isPositive())
    }

    getNegative() {
        return this.get().filter((v) => !v.isVoteOutcome() && !v.isPositive())
    }

    getCovered() {
        const exposed = this.getExposed()
        return this.get().filter((v) => !exposed.includes(v))
    }

    toMessage(
        i18n: I18n,
        { includeHidden, includeExpired, onlyHidden, withIndex }: VouchMessageOptions = {},
        guildId?: string,
    ) {
        const vouches = this.vouches.filter(
            (v) =>
                (includeHidden || onlyHidden || !v.isHidden()) &&
                (includeExpired || !v.isExpired()) &&
                (!onlyHidden || v.isHidden()),
        )

        const positive = vouches.filter((v) => v.isPositive())
        const expired = this.getExpired()

        const councilRole = guildId
            ? PositionRole.getRoles(`${this.position} Council`, guildId)[0]
            : undefined

        const embedFields = vouches.map((v, i) =>
            VouchUtil.toEmbedField(v, i18n, councilRole, withIndex ? i + 1 : undefined),
        )

        if (!includeExpired && !includeHidden && !onlyHidden && expired.length)
            embedFields.push(
                i18n.getObject(
                    "vouches.expired",
                    `${expired.length}`,
                    TimeUtil.stringifyTimeDelta(Vouch.getExpiration(this.position)),
                ) as EmbedField,
            )

        const mention = userMention(this.userId)
        if (embedFields.length === 0)
            return new LocalizedError("vouches.none", mention, this.position).toMessagePayload(i18n)

        const color = ColorUtil.hsvToRgb((120 / vouches.length) * positive.length || 0, 1, 1)
        return new MessageOptionsBuilder().createMultipleEmbeds(embedFields, (fields) =>
            i18n
                .getEmbed("vouches.embed_summary", { title: [this.position] })
                .setFields(...fields)
                .setAuthor({
                    iconURL: this.user?.avatarURL() ?? undefined,
                    name: `${this.user?.tag} (${this.userId})`,
                })
                .setColor(color),
        )
    }

    toRemoveMessage(i18n: I18n, guildId?: string) {
        const message = this.toMessage(
            i18n,
            { includeExpired: true, includeHidden: true, withIndex: true },
            guildId,
        )

        const options = this.vouches.map((v, i) => ({
            label: TextUtil.limitText(VouchUtil.toString(v, i18n, i + 1).replace(/\*/g, ""), 100, "..."),
            value: v.id!,
        }))

        Array.from(new Array(Math.ceil(options.length / 25)).keys())
            .map((_, i) => options.slice(i * 25, (i + 1) * 25))
            .map((options, i) =>
                new StringSelectMenuBuilder()
                    .setCustomId(`REMOVE_VOUCH/${this.userId}/${this.position}/${i}`)
                    .setPlaceholder("Select to Remove")
                    .addOptions(...options),
            )
            .slice(0, 5)
            .forEach((v) => message.addActions(v))

        return message
    }
}
