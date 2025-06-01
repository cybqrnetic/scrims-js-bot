import { createClient } from "redis"

export const redis = createClient({
    url: process.env["REDIS_URI"],
    socket: { reconnectStrategy: 3000, timeout: 6000, connectTimeout: 6000 },
})
redis.on("error", (err) => console.error(`[Redis Client] ${err}`))

const subscriber = redis.duplicate()
subscriber.on("error", (err) => console.error(`[Redis Subscriber] ${err}`))

export async function connectRedis() {
    await Promise.all([redis.connect(), subscriber.connect()])
        .then(() => console.log("Connected to redis."))
        .catch((err) => console.warn("Redis connection failed.", err))
}

export async function disconnectRedis() {
    await Promise.all([redis.destroy(), subscriber.destroy()])
}

export const messenger = {
    async pub(channel: string, message: unknown) {
        return redis.publish(channel, JSON.stringify(message))
    },

    async sub<T = unknown>(pattern: string | string[], listener: (message: T, channel: string) => unknown) {
        await subscriber
            .pSubscribe(pattern, (message: string, channel: string) => {
                try {
                    listener(JSON.parse(message) as T, channel)
                } catch (err) {
                    console.error(err)
                }
            })
            .catch(console.error)
    },
}
