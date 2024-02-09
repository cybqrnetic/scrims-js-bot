import { createClient } from "redis"

export const redis = createClient({
    url: process.env.REDIS_URI,
    socket: { reconnectStrategy: 3000, timeout: 6000, connectTimeout: 6000 },
})
export const subscriber = redis.duplicate()

subscriber.on("error", (err) => console.error(`[Redis Subscriber] ${err}`))
redis.on("error", (err) => console.error(`[Redis Client] ${err}`))

if (process.env.REDIS_URI)
    redis
        .connect()
        .then(() => subscriber.connect())
        .then(() => console.log(`Connected to Redis.`))
        .catch(console.error)
else if (process.argv[2] !== "test") {
    console.warn("REDIS_URI env var not set!")
}

export const messenger = {
    async pub(channel: string, message: unknown) {
        return redis.publish(channel, JSON.stringify(message))
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async sub<T = any>(pattern: string | string[], listener: (message: T, channel: string) => unknown) {
        await subscriber
            .pSubscribe(pattern, (message, channel) => {
                const data = JSON.parse(message)
                try {
                    listener(data?.message?.data ?? data, channel)
                } catch (err) {
                    console.error(err)
                }
            })
            .catch(console.error)
    },
}
