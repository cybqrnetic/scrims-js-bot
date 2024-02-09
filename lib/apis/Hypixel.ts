import { LocalizedError } from "../utils/LocalizedError"
import { APICache } from "./Cache"
import { HTTPError, RequestOptions, TimeoutError, request } from "./request"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class HypixelAPIError extends LocalizedError {}

const API_TOKEN = process.env.HYPIXEL_TOKEN
const SERVER = "api.hypixel.net"
const TIMEOUT = 7000

export class HypixelClient {
    static readonly Error = HypixelAPIError
    protected static throttling: number | null = null
    readonly players: HypixelPlayers = new HypixelPlayers(this)

    async hypixelRequest(
        endpoint: string,
        urlParams: Record<string, string> = {},
        options: RequestOptions = {}
    ) {
        if (!API_TOKEN) throw new TypeError("HYPIXEL_TOKEN is not set!")
        options.urlParams = new URLSearchParams({ key: API_TOKEN, ...urlParams })
        if (!options.timeout) options.timeout = TIMEOUT

        await this.waitForThrottlingOrAbort()
        return request(`https://${SERVER}/${endpoint}`, options)
            .then((v) => v.json())
            .catch((error) => this.onError(error))
    }

    protected async onError(error: unknown) {
        if (error instanceof TimeoutError) throw new HypixelAPIError("api.timeout", "Hypixel API")
        if (error instanceof HTTPError) {
            if (error.response.status === 429) {
                const timeout = parseInt(error.response.headers.get("retry-after") || "")
                if (timeout) this.enableThrottling(timeout)
                throw new HypixelAPIError("api.throttling", "Hypixel API")
            }

            const resp = await error.response.json()
            if (resp.cause)
                console.error(`${error.response.url} reported ${error.response.status}: ${resp.cause}!`)
            else console.error(`${error.response.url} responded with a ${error.response.status} status!`)
        } else console.error("Unexpected Hypixel API Error", error)

        throw new HypixelAPIError(`api.request_failed`, "Hypixel API")
    }

    protected async waitForThrottlingOrAbort() {
        if (HypixelClient.throttling) {
            const wait = HypixelClient.throttling - Date.now()
            if (wait >= 5000) throw new HypixelAPIError("api.throttling", "Hypixel API")
            await sleep(wait + Math.random() * 1000)
        }
    }

    protected enableThrottling(seconds: number) {
        HypixelClient.throttling = Date.now() + seconds * 1000
        sleep(seconds * 1000).then(() => {
            HypixelClient.throttling = null
        })
    }
}

// prettier-ignore
const BEDWARS_ODD_LEVELS = [[500, 0], [1500, 1], [3500, 2], [7000, 3]]
const BEDWARS_LEVELS_PER_PRESTIGE = 100
const BEDWARS_EXP_PER_PRESTIGE = 487000
const BEDWARS_EXP_PER_LEVEL = 5000

const playersCache = new APICache<HypixelPlayerData>({ ttl: 60 * 60, max: 100 })

class HypixelPlayers {
    constructor(readonly client: HypixelClient) {}

    get cache() {
        return playersCache
    }

    protected getBedwarsLevelProgress(exp: number) {
        exp = exp % BEDWARS_EXP_PER_PRESTIGE
        const lastOddLevel = BEDWARS_ODD_LEVELS.slice(-1)[0]
        const strangeLevel = BEDWARS_ODD_LEVELS.filter(([max, _]) => exp < max).map(([_, level]) => level)[0]
        return (
            strangeLevel ?? Math.floor((exp - lastOddLevel[0]) / BEDWARS_EXP_PER_LEVEL) + lastOddLevel[1] + 1
        )
    }

    protected getBedwarsPrestige(exp: number) {
        const prestige = Math.floor(exp / BEDWARS_EXP_PER_PRESTIGE)
        return prestige * BEDWARS_LEVELS_PER_PRESTIGE
    }

    protected getBedwarsStats(stats: any): HypixelPlayerBedwarsData {
        const bwStats = stats?.player?.stats?.Bedwars ?? {}

        const exp = bwStats["Experience"] ?? 0
        const prestige = this.getBedwarsPrestige(exp)
        const progress = this.getBedwarsLevelProgress(exp)

        const wins = bwStats["wins_bedwars"] ?? 0
        const losses = bwStats["losses_bedwars"] ?? 0
        const finalKills = bwStats["final_kills_bedwars"] ?? 0
        const finalDeaths = bwStats["final_deaths_bedwars"] ?? 0

        // prettier-ignore
        return {
            exp, prestige, progress, 
            level: prestige + progress,
            wins, losses, wlr: wins / losses,
            finalKills, finalDeaths,
            fkdr: finalKills / finalDeaths,
            ws: bwStats["winstreak"] ?? 0
        }
    }

    async fetch(uuid: string, useCache = true) {
        if (useCache) {
            const cached = this.cache.get(uuid)
            if (cached) return cached
        }

        const response = await this.client.hypixelRequest("player", { uuid })
        if (!response["success"] || !response["player"]) {
            console.error("Invalid Hypixel Player Response!", response)
            throw new HypixelAPIError(`api.request_failed`, "Hypixel API")
        }

        const player = { ...response["player"], bedwars: this.getBedwarsStats(response) } as HypixelPlayerData
        this.cache.set(uuid, player)
        return player
    }
}

export interface HypixelPlayerData {
    uuid: string
    displayname: string
    rank: string
    packageRank: string
    newPackageRank: string
    monthlyPackageRank: string
    firstLogin: number
    lastLogin: number
    lastLogout: number
    stats: Record<string, Record<string, unknown>>
    bedwars: HypixelPlayerBedwarsData
}

export interface HypixelPlayerBedwarsData {
    exp: number
    prestige: number
    progress: number
    level: number
    wins: number
    losses: number
    wlr: number
    finalKills: number
    finalDeaths: number
    fkdr: number
    ws: number
}
