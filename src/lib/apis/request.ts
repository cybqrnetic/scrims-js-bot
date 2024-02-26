export interface RequestOptions extends RequestInit {
    signal?: never | null
    headers?: Record<string, string>
    /** number in seconds */
    timeout?: number
    urlParams?: Record<string, any>
}

export class RequestError extends Error {
    name = "RequestError"
}

export class TimeoutError extends RequestError {
    name = "TimeoutError"
}

export class HTTPError extends RequestError {
    name = "HTTPError"
    public response: Response

    constructor(msg: string, response: Response) {
        super(msg)
        this.response = response
    }
}

export async function request(url: string, options: RequestOptions = {}): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), (options.timeout || 10) * 1000)
    if (options.urlParams) url += `?${new URLSearchParams(options.urlParams)}`

    function requestError(): Response {
        if (controller.signal.aborted) throw new TimeoutError("Server took too long to respond")
        throw new RequestError("Network unavailable")
    }

    return fetch(url, { ...options, signal: controller.signal, cache: "no-cache" })
        .catch(requestError)
        .then(async (resp) => {
            clearTimeout(timeoutId)
            if (!resp.ok) {
                throw new HTTPError(`${resp.status} Response`, resp)
            }
            return resp
        })
}
