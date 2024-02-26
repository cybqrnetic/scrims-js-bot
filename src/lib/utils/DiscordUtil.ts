import {
    CachedManager,
    Collection,
    EmbedAuthorData,
    Guild,
    GuildMember,
    TimestampStylesString,
    User,
    userMention,
} from "discord.js"

import { DateTime } from "luxon"

type BasicCachedManager<K, Holds, V> = CachedManager<K, Holds, V> & {
    fetch: (options?: { limit?: number; after?: string }) => Promise<Collection<K, Holds>>
}

declare module "luxon" {
    interface DateTime {
        toDiscord(): `<t:${number}>`
        toDiscord<S extends TimestampStylesString>(style: S): `<t:${number}:${S}>`
    }
}

// @ts-ignore
DateTime.prototype.toDiscord = function (style?: TimestampStylesString) {
    return DiscordUtil.formatTime(this, style)
}

declare global {
    interface Date {
        toDiscord(): `<t:${number}>`
        toDiscord<S extends TimestampStylesString>(style: S): `<t:${number}:${S}>`
    }
}

// @ts-ignore
Date.prototype.toDiscord = function (style?: TimestampStylesString) {
    return DiscordUtil.formatTime(this, style)
}

export class DiscordUtil {
    /** Date can be a timestamp is milliseconds or seconds*/
    static formatTime<S extends TimestampStylesString>(date: DateTime | Date | number, style?: S) {
        if (date instanceof Date) date = Math.floor(date.valueOf() / 1000)
        else if (date instanceof DateTime) date = Math.floor(date.toSeconds())
        else if (typeof date === "number") {
            date = Math.floor(date)
            if (date.toString().length === 13) date = Math.floor(date / 1000)
        }
        return `<t:${date}${style ? `:${style}` : ""}>`
    }

    static userAsEmbedAuthor(user?: GuildMember | User | null): EmbedAuthorData | null {
        if (!user) return null
        return {
            name: user instanceof User ? user.tag : user.user.tag,
            iconURL: user.displayAvatarURL(),
        }
    }

    static async *multiFetch<K extends string, Holds, V>(
        cacheManager: BasicCachedManager<K, Holds, V>,
        chunkSize = 100,
        limit?: number,
    ): AsyncGenerator<Collection<K, Holds>, void, void> {
        let chunk: Collection<K, Holds> = await cacheManager.fetch({ limit: chunkSize })

        while (true) {
            if (limit !== undefined) limit -= chunk.size
            if (chunk.size === 0) break
            yield chunk
            if (chunk.size !== chunkSize || (limit !== undefined && limit <= 0)) break
            chunk = await cacheManager.fetch({ limit: chunkSize, after: chunk.lastKey() })
        }
    }

    static async completelyFetch<K extends string, Holds, V>(
        cacheManager: BasicCachedManager<K, Holds, V>,
        chunkSize = 100,
        limit?: number,
    ) {
        let results = new Collection<K, Holds>()
        for await (const fetched of this.multiFetch(cacheManager, chunkSize, limit))
            results = results.concat(fetched)
        return results
    }

    static userMention(userId?: string, unknown = "") {
        if (!userId) return unknown
        return userMention(userId)
    }

    static parseUser(resolvable: string, guild: Guild): GuildMember | undefined {
        resolvable = resolvable.replace(/```|:|\n|@/g, "")

        const find = (resolvable: string, matches: GuildMember[] = []) => {
            const members = Array.from(guild.members.cache.values())
            matches = members.filter((m) => m.id === resolvable)
            if (matches.length === 1) return matches[0]

            matches = members.filter((m) => m.user.username === resolvable)
            if (matches.length === 1) return matches[0]

            matches = members.filter((m) => m.displayName === resolvable)
            if (matches.length === 1) return matches[0]
        }

        return find(resolvable) ?? find(resolvable.toLowerCase())
    }
}
