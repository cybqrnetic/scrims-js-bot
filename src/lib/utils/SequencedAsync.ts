interface State<R> {
    running?: Promise<R>
    delete: () => unknown
}

interface Options<A extends unknown[], M extends boolean> {
    mapper?: (...args: A) => string
    cooldown?: number
    merge?: M
}

function stateFactory<A extends unknown[], R>(options: Options<A, boolean>): (args: A) => State<R> {
    if (options.mapper) {
        const map = new Map<string, State<R>>()
        return (args: A) => {
            const key = options.mapper!(...args)
            const existing = map.get(key)
            if (existing) return existing

            const state = { delete: () => map.delete(key) }
            map.set(key, state)
            return state
        }
    }

    const state: State<R> = { delete: () => (state.running = undefined) }
    return () => state
}

export function SequencedAsync(options?: Options<unknown[], boolean>): MethodDecorator {
    return function decorator(target: unknown, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
        const action = descriptor.value as (...args: unknown[]) => Promise<unknown>
        descriptor.value = sequencedAsync(action, options)
        return descriptor
    }
}

export function sequencedAsync<A extends unknown[], R, M extends boolean = false>(
    action: (...args: A) => Promise<R>,
    options: Options<A, M> = {},
): (...args: A) => Promise<M extends true ? R | void : R> {
    const getState = stateFactory<A, R>(options)
    return function (this: unknown, ...args: A) {
        const state = getState(args)
        if (state.running) {
            if (options.merge) {
                return Promise.resolve() as Promise<R>
            }

            state.running = state.running.then(
                () => action.apply(this, args),
                () => action.apply(this, args),
            )
        } else {
            state.running = action.apply(this, args)
        }

        const actual = state.running
        if (options.cooldown) {
            state.running = new Promise((resolve, reject) =>
                actual.then(
                    (v) => sleep(options.cooldown!).then(() => resolve(v)),
                    (e: Error) => sleep(options.cooldown!).then(() => reject(e)),
                ),
            )
        }

        const ours = state.running
        const cleanup = () => {
            if (state.running === ours) {
                state.delete()
            }
        }
        state.running.then(cleanup, cleanup)

        return actual
    }
}
