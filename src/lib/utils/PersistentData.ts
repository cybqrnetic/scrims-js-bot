import fs from "fs/promises"

interface Vault {
    from: number
    data: unknown
}

const instances: PersistentData<any, any>[] = []

export class PersistentData<T, D> {
    static save() {
        return Promise.all(instances.map((v) => v.save().catch(console.error)))
    }

    private readonly file: string
    private promise: Promise<D>
    private loading = false
    private resolve?: (value: D) => unknown
    private data?: D

    constructor(
        name: string,
        private readonly def: D,
        private readonly encoder: (data: D) => T,
        private readonly loader: (from: Date, data: T) => D,
    ) {
        this.file = `${process.cwd()}/data/${name}.json`
        this.promise = new Promise((resolve) => (this.resolve = resolve))
        instances.push(this)
    }

    protected async save() {
        if (!this.data) return

        const vault: Vault = { from: Date.now(), data: this.encoder(this.data) }
        await fs.writeFile(this.file, ExtendedJSON.stringify(vault))
    }

    protected async loadPromise() {
        try {
            const vault: Vault = ExtendedJSON.parse(await fs.readFile(this.file, "utf8"))
            this.data = this.loader(new Date(vault.from), vault.data as T)
        } catch (error: any) {
            if (error?.code !== "ENOENT") console.error(error)
            this.data = this.def
        }
        return this.data
    }

    load() {
        if (!this.loading) {
            this.loading = true
            this.loadPromise().then((v) => this.resolve!(v))
        }
    }

    async get(load: boolean = true) {
        if (load) this.load()
        return this.promise
    }
}

class ExtendedJSON {
    static parse(text: string) {
        return JSON.parse(text, this.receiver)
    }

    static stringify(value: any) {
        return JSON.stringify(value, this.replacer)
    }

    private static replacer(key: string, value: any) {
        if (value instanceof Map) return { $map: Array.from(value.entries()) }
        if (value instanceof Set) return { $set: Array.from(value.values()) }
        return value
    }

    private static receiver(key: string, value: any) {
        if (value?.$map && Object.keys(value).length === 1) return new Map(value.$map)
        if (value?.$set && Object.keys(value).length === 1) return new Set(value.$set)
        return value
    }
}
