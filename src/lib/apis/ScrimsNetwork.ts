import { userMention } from "discord.js"
import { LocalizedError } from "../utils/LocalizedError"
import { UserError } from "../utils/UserError"
import { RequestError, TimeoutError, request } from "./request"

export class ScrimsNetwork {
    static async fetch<T>(endpoint: string, params: Record<string, string>): Promise<T> {
        const url = `https://api.scrims.network/v1/${endpoint}?${new URLSearchParams(params)}`
        const resp = await request(url).catch((error) => {
            if (error instanceof TimeoutError) throw new LocalizedError("api.timeout", "Scrims Network API")
            if (error instanceof RequestError)
                throw new LocalizedError(`api.request_failed`, "Scrims Network API")
            throw error
        })

        return resp.json() as Promise<T>
    }

    static async fetchUserId(username: string): Promise<string> {
        const body = await this.fetch<UserResponse>("user", { username })
        const data = body.user_data
        if (!data) throw new UserError(`Player by the name of '${username}' couldn't be found!`)
        if (!data.discordId)
            throw new UserError(`${data.username} doesn't have their Discord account linked.`)

        return data.discordId
    }

    static async fetchUsername(discordId: string) {
        const body = await this.fetch<UserResponse>("user", { discordId })
        const data = body.user_data
        if (!data) {
            throw new UserError(`${userMention(discordId)} doesn't have a linked Minecraft account.`)
        }

        return data.username
    }
}

interface UserResponse {
    user_data?: {
        _id: string
        username: string
        discordId: string
    }
}
