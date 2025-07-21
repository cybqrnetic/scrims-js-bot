interface State {
    running?: Promise<unknown>
    count: number
    delete: () => unknown
}

interface Options<M extends boolean> {
    cooldown?: number
    merge?: M
}

export class SequencedAsyncExecutor<M extends boolean = false> {
    private stateMap?: Map<string, State>
    private unboundState?: State

    constructor(private readonly options: Options<M> = {}) {}

    private getState(key: string | undefined): State {
        if (key === undefined) {
            if (!this.unboundState) {
                this.unboundState = { count: 0, delete: () => (this.unboundState = undefined) }
            }
            return this.unboundState
        } else {
            if (!this.stateMap) {
                this.stateMap = new Map()
            }

            const existing = this.stateMap.get(key)
            if (existing) return existing

            const state = { count: 0, delete: () => this.stateMap!.delete(key) }
            this.stateMap.set(key, state)
            return state
        }
    }

    private async submit0<T>(
        key: string | undefined,
        action: () => Promise<T>,
    ): Promise<M extends true ? T | void : T> {
        const state = this.getState(key)
        if (state.count > 1 && this.options.merge) {
            // @ts-expect-error M === true means we can return void
            return Promise.resolve()
        }

        let actualPromise: Promise<T>
        if (state.running) {
            actualPromise = state.running.then(
                () => action.apply(this),
                () => action.apply(this),
            )
        } else {
            actualPromise = action.apply(this)
        }

        if (this.options.cooldown) {
            state.running = actualPromise.then(
                () => sleep(this.options.cooldown!),
                () => sleep(this.options.cooldown!),
            )
        } else {
            state.running = actualPromise
        }

        state.count++
        const ours = state.running

        const cleanup = () => {
            state.count--
            if (state.running === ours) {
                state.delete()
            }
        }
        state.running.then(cleanup, cleanup)

        return actualPromise
    }

    async submit<T>(key: string, action: () => Promise<T>) {
        return this.submit0<T>(key, action)
    }

    async execute<T>(action: () => Promise<T>) {
        return this.submit0<T>(undefined, action)
    }
}

export function SequencedAsync(options?: Options<boolean>): MethodDecorator {
    return function decorator<T>(
        target: unknown,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor,
    ) {
        const action = descriptor.value as (...args: unknown[]) => Promise<T>
        const executor = new SequencedAsyncExecutor(options)
        descriptor.value = async function (...args: unknown[]) {
            return executor.execute(() => action.apply(this, args))
        }
        return descriptor
    }
}
