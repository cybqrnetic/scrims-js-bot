import { SnowflakeUtil } from "discord.js"

type Encoded = [string, unknown][]

export interface ExchangeState {
    getId(): string | null
    get<V>(id: string): V | undefined
    set(id: string, value: unknown): void
    delete(id: string): void
}

export class ExchangeStateImpl implements ExchangeState {
    expiration?: NodeJS.Timeout
    protected readonly values = new Map<string, unknown>()

    constructor(
        protected id: string | null = null,
        data?: unknown,
    ) {
        if (data) {
            for (const [key, value] of data as Encoded) {
                this.values.set(key, value)
            }
        }
    }

    getId() {
        return this.id
    }

    get<V>(id: string): V | undefined {
        return this.values.get(id) as V
    }

    set(id: string, value: unknown) {
        if (this.id === null) {
            this.id = SnowflakeUtil.generate().toString()
        }

        this.values.set(id, value)
    }

    delete(id: string) {
        this.values.delete(id)
    }

    toJSON(): Encoded {
        return Array.from(this.values.entries())
    }
}
