import { LocalizedError } from "../utils/LocalizedError"
import { UserError } from "../utils/UserError"
import { RequestError, TimeoutError, request } from "./request"

export class ScrimsNetwork {
    static async fetchUserId(ign: string): Promise<string> {
        const url = `https://api.scrims.network/v1/user?${new URLSearchParams({ username: ign })}`
        const resp = await request(url).catch((error) => {
            if (error instanceof TimeoutError) throw new LocalizedError("api.timeout", "Scrims Network API")
            if (error instanceof RequestError)
                throw new LocalizedError(`api.request_failed`, "Scrims Network API")
            throw error
        })

        const body = (await resp.json()) as UserResponse
        const data = body["user_data"]
        if (!data) throw new UserError(`Player by the name of '${ign}' couldn't be found!`)
        if (!data.discordId)
            throw new UserError(`${data.username} doesn't have their Discord account linked.`)

        return data.discordId
    }
}

interface UserResponse {
    user_data: {
        username: string
        discordId: string
    }
}
