export class Mutex {
    private promise?: PromiseWithResolvers<null>

    async lock(): Promise<() => void> {
        if (this.promise !== undefined) {
            await this.promise.promise
            return this.lock()
        }

        this.promise = Promise.withResolvers()
        return () => this.unlock()
    }

    async run(task: () => unknown) {
        const unlock = await this.lock()
        try {
            await task()
        } finally {
            unlock()
        }
    }

    private unlock() {
        this.promise?.resolve(null)
        this.promise = undefined
    }
}
