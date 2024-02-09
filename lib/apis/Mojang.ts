import { LocalizedError } from "../utils/LocalizedError"
import { APICache } from "./Cache"
import { HTTPError, RequestOptions, TimeoutError, request } from "./request"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class MojangAPIError extends LocalizedError {}

const SESSION_SERVER = "sessionserver.mojang.com"
const API_SERVER = "api.mojang.com"
const TIMEOUT = 7000

export class MojangClient {
    static readonly Error = MojangAPIError
    static readonly profilesCache = new APICache<MojangUserProfile>({ ttl: 12 * 60 * 60, max: 200 })

    protected static throttling: number | null = null

    static async mojangRequest(server: string, path: string[], urlParams = {}, options: RequestOptions = {}) {
        options.urlParams = new URLSearchParams(urlParams)
        if (!options.timeout) options.timeout = TIMEOUT

        await this.waitForThrottlingOrAbort()
        return request(`https://${server}/${path.join("/")}`, options)
            .then((v) => v.json())
            .catch((error) => this.onError(error))
    }

    static async uuidToProfile(uuid: string, useCache = true): Promise<MojangUserProfile | null> {
        if (useCache) {
            const profile = this.profilesCache.get(uuid)
            if (profile) return profile
        }

        const response = await this.mojangRequest(SESSION_SERVER, ["session", "minecraft", "profile", uuid])
        if (!response?.id || !response?.name) return null

        const result = { id: this.normalizeUUID(response.id), name: response.name }
        this.profilesCache.set(uuid, result)
        return result
    }

    static async uuidToName(uuid: string, useCache = true) {
        return this.uuidToProfile(uuid, useCache).then((v) => v?.name ?? null)
    }

    static normalizeName(name: string) {
        return name.replace(/\W+/g, "").trim().toLowerCase().slice(0, 25)
    }

    static normalizeUUID(uuid: string) {
        return (
            `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}` +
            `-${uuid.slice(16, 20)}-${uuid.slice(20)}`
        )
    }

    static async nameToProfile(name: string, useCache = true): Promise<MojangResolvedUser | null> {
        name = this.normalizeName(name)

        if (useCache) {
            const profile = this.profilesCache.find((v) => v.name.toLowerCase() === name)
            if (profile) return profile
        }

        const response = await this.mojangRequest(API_SERVER, ["users", "profiles", "minecraft", name])
        if (!response?.id || !response?.name) return null

        const result = { id: this.normalizeUUID(response.id), name: response.name }
        this.profilesCache.set(response.id, result)
        return result
    }

    protected static async onError(error: any) {
        if (error instanceof TimeoutError) throw new MojangAPIError("api.timeout", "Mojang API")
        if (error instanceof HTTPError) {
            if (error.response.status === 404) return {}
            if (error.response.status === 429) {
                const timeout = parseInt(error.response.headers.get("retry-after") || "")
                if (timeout) this.enableThrottling(timeout)
                throw new MojangAPIError("api.throttling", "Mojang API")
            }
            console.error(`${error.response.url} responded with a ${error.response.status} status!`)
        } else console.error("Unexpected Mojang API Error", error)

        throw new MojangAPIError(`api.request_failed`, "Mojang API")
    }

    protected static async waitForThrottlingOrAbort() {
        if (this.throttling) {
            const wait = this.throttling - Date.now()
            if (wait >= 5000) throw new MojangAPIError("api.throttling", "Mojang API")
            await sleep(wait + Math.random() * 1000)
        }
    }

    protected static enableThrottling(seconds: number) {
        this.throttling = Date.now() + seconds * 1000
        sleep(seconds * 1000).then(() => {
            this.throttling = null
        })
    }
}

export interface MojangResolvedUser {
    id: string
    name: string
}

export type MojangUserProfile = MojangResolvedUser
