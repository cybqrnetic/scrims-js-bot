import { Collection } from "discord.js"
import { Config } from "./Config"

export function DynamicallyCreatedCollection<T>(
    type: string,
    createCall: (entry: Config) => T,
    removeCall: (obj: Awaited<T>) => unknown,
): Collection<string, Awaited<T>> {
    const collection = new Collection<string, Awaited<T>>()
    async function remove(guildId: string) {
        if (collection.has(guildId)) {
            try {
                await removeCall(collection.get(guildId)!)
            } finally {
                collection.delete(guildId)
            }
        }
    }

    async function add(entry: Config) {
        await remove(entry.guildId).catch(console.error)
        collection.set(entry.guildId, await createCall(entry))
    }

    Config.onCache("add", type, (entry) => add(entry))
    Config.onCache("delete", type, (entry) => remove(entry.guildId))
    return collection
}
