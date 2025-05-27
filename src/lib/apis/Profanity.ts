import { LocalizedError } from "../utils/LocalizedError"
import { request, RequestError, TimeoutError } from "./request"
export class Profanity {
    static async isProfanity(message: string): Promise<boolean> {
        const url = "https://vector.profanity.dev"
        const resp = await request(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message }),
        }).catch((error) => {
            if (error instanceof TimeoutError) throw new LocalizedError("api.timeout", "Profanity API")
            if (error instanceof RequestError) throw new LocalizedError(`api.request_failed`, "Profanity API")
            throw error
        })

        const body = await resp.json()
        return body.isProfanity
    }
}
