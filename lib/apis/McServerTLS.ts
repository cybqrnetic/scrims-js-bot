import { ASSETS } from "@Constants"
import { randomUUID } from "crypto"
import { EventEmitter } from "events"
import fs from "fs/promises"
import tls, { TLSSocket } from "tls"

const KEY = process.env.MC_TLS_KEY ? Buffer.from(process.env.MC_TLS_KEY, "base64") : null
const HEADER_SIZE = 4

let CA: Buffer, CERT: Buffer

// prettier-ignore
export type TLSConnectionState = "initial" | "connecting" | "tlsHandshake" | "sdiHandshake" | "connected" | "disconnected"
export class McServerTLSConnection {
    protected responses = new EventEmitter({ captureRejections: true })
    protected events = new EventEmitter({ captureRejections: true })

    protected state: TLSConnectionState = "initial"
    protected serverSequence?: string
    protected socket?: TLSSocket
    protected session?: Buffer
    protected siid?: string

    constructor(readonly intents: number) {
        this.responses.on("error", console.error)
        this.events.on("error", console.error)
    }

    getStatus() {
        return this.state
    }

    async connect() {
        if (KEY && (this.state === "initial" || this.state === "disconnected")) {
            this.state = "connecting"

            if (!CA || !CERT) {
                CA = await fs.readFile(ASSETS + "mc_certs/ca.crt")
                CERT = await fs.readFile(ASSETS + "mc_certs/client.crt")
            }

            const socket = tls.connect({
                ca: CA,
                cert: CERT,
                key: KEY,
                host: process.env.MC_TLS_HOST!,
                port: parseInt(process.env.MC_TLS_PORT!),
                session: this.session,
                rejectUnauthorized: true,
            })

            socket.once("close", () => this.cleanup())
            socket.once("session", (session) => (this.session = session))
            socket.once("connect", () => (this.state = "tlsHandshake"))
            socket.once("error", (err) => {
                this.cleanup()
                if (err instanceof ProtocolError) console.warn(`${err} // Reattempting in 6 seconds.`)
                else console.warn(`[MC TLS] ${err} // Reattempting in 6 seconds.`)
                setTimeout(() => this.connect(), 6000)
            })

            socket.once("secureConnect", () => {
                if (!socket.authorized) {
                    socket.destroy(socket.authorizationError)
                } else {
                    this.state = "sdiHandshake"
                    const playback = this.siid &&
                        this.serverSequence && { siid: this.siid, s: this.serverSequence }

                    this.write("INITIATE", { intents: this.intents, playback }, true)
                        .then((response) => {
                            const { siid } = response as ServerIdentification
                            this.siid = siid

                            this.listenForData(socket)
                            this.state = "connected"
                            this.socket = socket
                            this.events.emit("connected")
                            console.log("[MC TLS] Connection established!")
                        })
                        .catch((err) => {
                            if (this.state === "sdiHandshake")
                                socket.destroy(
                                    new ProtocolError(
                                        `Initiation Failed // ${err.constructor.name}: ${err.message}`,
                                    ),
                                )
                        })
                }
            })
        }
    }

    protected listenForData(socket: TLSSocket) {
        let messageSize = 0
        let messageBuffer = Buffer.alloc(0)

        socket.on("data", (data: Buffer) => {
            try {
                if (messageSize === 0) {
                    if (data.byteLength <= HEADER_SIZE)
                        throw new ProtocolError("Server sent a message which is too short")
                    messageSize = data.readUInt32BE(0)
                    data = data.subarray(HEADER_SIZE)
                }

                messageBuffer = Buffer.concat([messageBuffer, data])
                if (messageBuffer.byteLength > messageSize)
                    throw new ProtocolError("Server sent a larger message than expected")

                if (messageBuffer.byteLength === messageSize) {
                    const { c, s, d, e, m } = JSON.parse(messageBuffer.toString("utf-8")) as ServerMessage
                    if (c.startsWith("RESPONSE/")) this.responses.emit(c.slice(9), e ? new ServerError(e) : d)
                    else {
                        if (s !== undefined) this.serverSequence = s
                        const respond = (response: unknown) => this.respond(m, response)
                        this.events.emit(c, d, respond)
                    }

                    messageBuffer = Buffer.alloc(0)
                    messageSize = 0
                } else {
                    /** Message is not complete yet keep listening! */
                }
            } catch (error) {
                // turn JSON parse errors into ProtocolErrors
                // eslint-disable-next-line no-ex-assign
                if (error instanceof SyntaxError) error = new ProtocolError(error.message)
                socket.emit("error", error as Error)
                socket.destroy()
            }
        })
    }

    protected cleanup() {
        this.state = "disconnected"
        this.socket?.removeAllListeners("data")
        this.socket = undefined
    }

    destroy() {
        if (this.socket) this.socket.destroy()
    }

    protected async respond(id: string | undefined, response: unknown) {
        if (id) {
            const res = await this.deliver(`RESPONSE/${id}`, response)
                .then(() => true)
                .catch(console.error)
            return res === true
        }
        return false
    }

    /** Send and ignore errors (for non important messages) */
    async send(channel: string, data: unknown): Promise<boolean> {
        return this._deliver(channel, data, false)
            .then(() => true)
            .catch(() => false)
    }

    /** Send and throws errors if not successful */
    async deliver(channel: string, data: unknown) {
        return this._deliver(channel, data, false).catch(PromiseError.throw) as Promise<void>
    }

    /** Send and await a response */
    async get<T>(channel: string, payload: unknown) {
        return this._deliver(channel, payload, true).catch(PromiseError.throw) as Promise<T>
    }

    protected async _deliver(channel: string, data: unknown, awaitResponse: boolean) {
        if (this.state !== "connected") {
            return new Promise<unknown>((res, rej) => {
                const timeout = setTimeout(() => {
                    this.events.removeListener("connected", readyListener)
                    rej(new ConnectionError("Could not reconnect in time"))
                }, 10000)

                const readyListener = () => {
                    clearTimeout(timeout)
                    this.write(channel, data, awaitResponse).then(res).catch(rej)
                }

                this.events.once("connected", readyListener)
            })
        }

        return this.write(channel, data, awaitResponse)
    }

    protected encodeMessage(channel: string, data: unknown, messageId: string) {
        const content = JSON.stringify({ c: channel, d: data, m: messageId })
        const payload = Buffer.from(content, "utf-8")
        const header = Buffer.alloc(HEADER_SIZE)
        header.writeUInt32BE(payload.byteLength)
        return Buffer.concat([header, payload])
    }

    protected async write(channel: string, data: unknown, awaitResponse: boolean) {
        const id = randomUUID()
        const message = this.encodeMessage(channel, data, id)
        return new Promise<unknown>((res, rej) => {
            this.socket!.write(message, (err) => {
                if (err) rej(new SocketWriteError(err.message))
                else {
                    if (awaitResponse) {
                        this.awaitResponse(id)
                            .then(res)
                            .catch((err) => {
                                err.channel = channel
                                err.payload = data
                                rej(err)
                            })
                    } else {
                        res(0)
                        this.awaitResponse(id).catch((err: unknown) => {
                            if (err instanceof ServerError)
                                console.error(`${err} in response to '${channel}'!`, data)
                        })
                    }
                }
            })
        })
    }

    protected async awaitResponse(messageId: string) {
        return new Promise<unknown>((res, rej) => {
            const timeout = setTimeout(() => {
                this.responses.removeListener(messageId, responseListener)
                this.socket?.removeListener("close", closeListener)

                rej(new ServerError("Server did not send a response in time"))
            }, 15000)

            const responseListener = (resp: unknown) => {
                this.socket?.removeListener("close", closeListener)
                clearTimeout(timeout)

                if (resp instanceof ServerError) rej(resp)
                else res(resp)
            }

            const closeListener = () => {
                this.responses.removeListener(messageId, responseListener)
                clearTimeout(timeout)

                rej(new ConnectionError("Connection closed"))
            }

            this.responses.once(messageId.toString(), responseListener)
            this.socket?.once("close", closeListener)
        })
    }

    async testLatency() {
        const start = Date.now()
        await this.get("PING", undefined)
        return Date.now() - start
    }

    on(
        event: string,
        listener: (payload: unknown, respond: (response: unknown) => Promise<boolean>) => unknown,
    ) {
        this.events.on(event, listener)
        return this
    }
}

interface ServerIdentification {
    siid: string
}

interface ServerMessage {
    c: string
    m?: string
    s?: string
    e?: string
    d?: unknown
}

export enum McServerIntents {
    MatchCallRequests = 1 << 0,
}

class PromiseError {
    name = "PromiseError"

    static throw(err: unknown) {
        if (err instanceof PromiseError) {
            const error = new Error(err.message)
            // @ts-ignore
            Object.entries(err).forEach(([key, val]) =>
                Object.defineProperty(error, key, { value: val, enumerable: true, configurable: true }),
            )
            Object.defineProperty(error, "name", { enumerable: false })
            throw error
        }
        return err
    }

    constructor(public message: string) {}

    toString() {
        return `${this.name}: ${this.message}`
    }
}

class ProtocolError extends Error {
    name = "[MC TLS] ProtocolError"
}

class ServerError extends PromiseError {
    name = "[MC TLS] ServerError"
}

class ConnectionError extends PromiseError {
    name = "[MC TLS] ConnectionError"
}

class SocketWriteError extends PromiseError {
    name = "[MC TLS] SocketWriteError"
}
