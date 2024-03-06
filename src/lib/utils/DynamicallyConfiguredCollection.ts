import { ScrimsBot } from ".."
import { Config } from "../db"

export class DynamicallyConfiguredCollection<T> {
    constructor(
        protected readonly type: string,
        protected readonly createCall: (entry: Config) => Promise<T>,
        protected readonly removeCall: (obj: T) => unknown,
        protected readonly created: Record<string, T> = {},
    ) {
        Config.cache.on("add", (v) => this.onCacheAdd(v).catch(console.error))
        Config.cache.on("delete", (v) => this.onCacheDelete(v).catch(console.error))
    }

    get clientId() {
        return ScrimsBot?.INSTANCE?.user?.id
    }

    guilds() {
        return Object.keys(this.created)
    }

    values() {
        return Object.values(this.created)
    }

    get(guildId: string) {
        return this.created[guildId]
    }

    protected isCorrectHandler(entry: Config) {
        return entry.type === this.type
    }

    protected async onCacheAdd(entry: Config) {
        if (this.isCorrectHandler(entry)) {
            this.remove(entry.guildId)
            this.created[entry.guildId] = await this.createCall(entry)
        }
    }

    remove(guildId: string) {
        if (guildId in this.created) {
            this.removeCall(this.created[guildId]!)
            delete this.created[guildId]
        }
    }

    protected async onCacheDelete(entry: Config) {
        if (this.isCorrectHandler(entry)) {
            this.remove(entry.guildId)
        }
    }
}
