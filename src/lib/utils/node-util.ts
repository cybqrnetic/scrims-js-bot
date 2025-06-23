declare global {
    interface Date {
        toSeconds(): number
    }

    interface Array<T> {
        toMap<K extends string | number | symbol>(extractor: (value: T) => K): Record<K, T>
        toMultiMap<K extends string | number | symbol>(extractor: (value: T) => K): Record<K, T[]>
        shuffle(): T[]
    }

    function record<T>(constant: Record<string, T>): Readonly<Record<string, T>>
    function sleep(ms: number): Promise<void>

    interface Console {
        /** Log a message if not in production */
        debug(this: void, message?: unknown, ...params: unknown[]): void

        /** Log an error if not in production */
        debugError(this: void, message?: unknown, ...params: unknown[]): void
    }
}

Date.prototype.toSeconds = function () {
    return Math.floor(this.valueOf() / 1000)
}

Array.prototype.toMap = function <K extends string | number | symbol>(extractor: (value: unknown) => K) {
    return Object.fromEntries(this.map((v) => [extractor(v) as string, v])) as Record<K, unknown>
}

Array.prototype.toMultiMap = function <K extends string | number | symbol>(extractor: (value: unknown) => K) {
    const map = {} as Record<K, unknown[]>
    for (const value of this) {
        const key = extractor(value)
        if (!map[key]?.push(value)) {
            map[key] = [value]
        }
    }

    return map
}

Array.prototype.shuffle = function () {
    for (let i = this.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[this[i], this[j]] = [this[j], this[i]]
    }
    return this
}

global.record = (constant) => Object.freeze(constant)
global.sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

if (process.env["NODE_ENV"] !== "production") {
    console.debug = console.log
    console.debugError = console.error
} else {
    console.debug = () => {}
    console.debugError = () => {}
}
