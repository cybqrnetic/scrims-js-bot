import {
    CachedManager,
    Collection,
    EmbedAuthorData,
    GuildMember,
    MessageManager,
    TimestampStylesString,
    User,
} from "discord.js"

import { DateTime } from "luxon"

type BasicCachedManager<K, Holds, V> = CachedManager<K, Holds, V> & {
    fetch: (options?: { limit?: number; after?: string }) => Promise<Collection<K, Holds>>
}

declare module "luxon" {
    interface DateTime {
        toDiscord(): string
        toDiscord<S extends TimestampStylesString>(style: S): string
    }
}

DateTime.prototype.toDiscord = function <S extends TimestampStylesString>(style?: S) {
    return DiscordUtil.formatTime(this, style)
}

declare global {
    interface Date {
        toDiscord(): string
        toDiscord<S extends TimestampStylesString>(style: S): string
    }
}

Date.prototype.toDiscord = function (style?: TimestampStylesString) {
    return DiscordUtil.formatTime(this, style)
}

export class DiscordUtil {
    static formatTime<S extends TimestampStylesString>(date: DateTime | Date | number, style?: S) {
        if (date instanceof Date) date = date.valueOf() / 1000
        else if (date instanceof DateTime) date = date.toSeconds()
        else date = date / 1000

        return `<t:${Math.floor(date)}${style ? `:${style}` : ""}>`
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
        reverse = false,
        limit?: number,
    ): AsyncGenerator<Collection<K, Holds>, void, void> {
        let chunk: Collection<K, Holds> = await cacheManager.fetch({ limit: chunkSize })

        while (true) {
            if (limit !== undefined) limit -= chunk.size
            if (chunk.size === 0) break
            yield chunk
            if (chunk.size !== chunkSize || (limit !== undefined && limit <= 0)) break
            chunk = await cacheManager.fetch({
                limit: chunkSize,
                [reverse ? "before" : "after"]: chunk.lastKey(),
            })
        }
    }

    static async completelyFetch<K extends string, Holds, V>(
        cacheManager: BasicCachedManager<K, Holds, V>,
        chunkSize = 100,
        reverse = false,
        limit?: number,
    ) {
        let results = new Collection<K, Holds>()
        for await (const fetched of this.multiFetch(cacheManager, chunkSize, reverse, limit))
            results = results.concat(fetched)
        return results
    }

    static async completelyFetchMessages<InGuild extends boolean>(
        manager: MessageManager<InGuild>,
        limit?: number,
    ) {
        return this.completelyFetch(manager, 100, true, limit)
    }
}
