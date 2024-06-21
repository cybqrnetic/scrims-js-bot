import { EventEmitter } from "events"
import { ObservableState } from "../utils/ObservableState"

export class DocumentCache<T> extends Map<string, T> {
    protected events = new EventEmitter({ captureRejections: true })
    readonly initialized = new ObservableState<boolean>()

    constructor() {
        super()
        this.events.on("error", console.error)
    }

    documents() {
        return Array.from(this.values())
    }

    filter(predicate: (value: T, index: number, array: T[]) => unknown) {
        return this.documents().filter(predicate)
    }

    map<O>(callbackfn: (value: T, index: number, array: T[]) => O) {
        return this.documents().map(callbackfn)
    }

    find(predicate: (value: T, index: number, array: T[]) => boolean) {
        return this.documents().find(predicate)
    }

    set(key: string, value: T): this {
        const old = this.get(key)
        super.set(key, value)
        if (old !== value) {
            if (old !== undefined) this.events.emit("delete", old)
            this.events.emit("add", value)
        }
        return this
    }

    delete(key: string): boolean {
        const value = this.get(key)
        if (super.delete(key)) {
            this.events.emit("delete", value)
            return true
        }
        return false
    }

    on(event: "add" | "delete", listener: (doc: T) => unknown): this {
        this.events.on(event, listener)
        return this
    }

    _triggerReloaded() {
        this.initialized.set(true)
        this.events.emit("reloaded")
    }

    async waitForReload(timeout = 500) {
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                resolve()
                this.events.off("reloaded", resolve)
            }, timeout)

            this.events.once("reloaded", resolve)
        })
    }
}
