export interface APICacheConfig {
    /** time to live in seconds (less than 0 or no value means no expiration)*/
    ttl?: number
    /** max number of keys after max is reached oldest are removed to make room (less than 0 or no value means no max) */
    max?: number
}

export class APICache<Holds> {
    readonly data: Record<string, Holds> = {}
    protected expirations: Record<string, number> = {}
    protected expireTimer?: NodeJS.Timer

    constructor(protected config: APICacheConfig = {}) {}

    protected ensureExpireTimer() {
        if (!this.expireTimer) this.expireTimer = setInterval(() => this.removeExpired(), 60 * 1000)
    }

    protected genExpiration(ttl?: number) {
        this.ensureExpireTimer()
        if (ttl === undefined) ttl = this.config.ttl ?? -1
        if (ttl > 0) return Math.floor(Date.now() / 1000) + ttl
    }

    protected refreshExpiration(key: string, ttl?: number) {
        const newExpiration = this.genExpiration(ttl)
        const expiration = this.expirations[key]
        if (expiration && newExpiration && newExpiration > expiration) this.expirations[key] = newExpiration
    }

    protected removeExpired() {
        const expired = this.keys().filter(
            (key) => this.expirations[key] && Date.now() / 1000 >= this.expirations[key]
        )
        expired.forEach((key) => this.delete(key))
    }

    protected checkSize() {
        if (this.config.max === 0) return false
        if (this.config.max && this.config.max > 0) {
            this.removeExpired()
            const difference = this.size() - this.config.max
            if (difference >= 0)
                this.keys()
                    .slice(0, difference + 1)
                    .forEach((key) => this.delete(key))
        }
        return true
    }

    keys() {
        return Object.keys(this.data)
    }

    values() {
        return Object.values(this.data)
    }

    size() {
        return this.keys().length
    }

    filter(predicate: (value: Holds, index: number, array: Holds[]) => boolean): Holds[] {
        const values = Object.values(this.data)
        const filtered = Object.entries(this.data).filter(([_, v], idx) => predicate(v, idx, values))
        filtered.forEach(([key, _]) => this.refreshExpiration(key))
        return filtered.map(([_, val]) => val)
    }

    find(predicate: (value: Holds, index: number, array: Holds[]) => boolean): Holds | undefined {
        return this.filter(predicate)[0]
    }

    get(key: string): Holds | undefined {
        const entry = this.data[key]
        if (entry === undefined) return undefined

        this.refreshExpiration(key)
        return entry
    }

    delete(key: string) {
        if (key in this.data) delete this.data[key]
        if (key in this.expirations) delete this.expirations[key]
    }

    /**
     * @param ttl time to live in seconds or undefined to use the inital configured value
     * @returns false if value was not added bcs of no space
     */
    set(key: string, value: Holds, ttl?: number) {
        const isSpace = this.checkSize()
        if (!isSpace) return false

        this.data[key] = value
        const expiration = this.genExpiration(ttl)
        if (expiration) this.expirations[key] = expiration

        return value
    }
}
