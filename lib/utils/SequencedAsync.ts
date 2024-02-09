const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface SequencedAsyncConfig {
    /** Number of seconds to wait between calls. */
    cooldown?: number
    /** If calls coming at the same time should be merged. */
    merge?: boolean
}

interface Self {
    call: (...args: unknown[]) => Promise<unknown>
    cooldown: number
    merge?: boolean
    index: number
    lastCall?: number
    running?: Promise<unknown>
}

export function SequencedAsync(config: SequencedAsyncConfig = {}): MethodDecorator {
    return function decorator(target: unknown, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
        const self: Self = {
            cooldown: (config?.cooldown ?? 0) * 1000,
            call: descriptor.value,
            merge: config.merge,
            index: 0,
        }

        const run = async (thisArg: unknown, args: unknown[]) => {
            if (self.lastCall) {
                const diff = Date.now() - self.lastCall
                if (diff < self.cooldown) await sleep(self.cooldown - diff)
            }
            const result = await (self.call.apply(thisArg, args) as Promise<unknown>).catch((err) => err)
            self.index -= 1
            self.lastCall = Date.now()
            return result
        }

        descriptor.value = async function imposter(...args: unknown[]) {
            if (self.index > 0 && self.merge) return
            self.index += 1
            if (self.running instanceof Promise) {
                self.running = self.running.then(() => run(this, args))
            } else {
                self.running = run(this, args)
            }
            return self.running.then(finishUp)
        }

        return descriptor
    }
}

function finishUp<T>(value: T | Error) {
    if (value instanceof Error) throw value
    return value
}
