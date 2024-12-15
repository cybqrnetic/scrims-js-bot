import { LocalizedError } from "../utils/LocalizedError"
import { HTTPError, RequestOptions, TimeoutError, request } from "./request"

export class ChalllongeAPIError extends LocalizedError {}

const API_TOKEN = process.env["CHALLONGE_TOKEN"]!
const SERVER = "api.challonge.com/v1"
const TIMEOUT = 7000

export class ChallongeBracketClient {
    static readonly Error = ChalllongeAPIError
    constructor(readonly tourneyId: string | number) {}

    protected extractParticipants(participants: any[] = []) {
        return Object.fromEntries(
            participants.map((item) => [item.participant.id, item.participant]),
        ) as ChallongeParticipants
    }

    protected extractMatches(matches: any[] = []) {
        return Object.fromEntries(matches.map((item) => [item.match.id, item.match])) as ChallongeMatches
    }

    protected extractTournament(tourney: any) {
        tourney.matches = this.extractMatches(tourney.matches)
        tourney.participants = this.extractParticipants(tourney.participants)
        return tourney as ChallongeTournament
    }

    async challongeRequest(
        method: "GET" | "POST" | "PUT" | "DELETE",
        path: string[],
        urlParams: Record<string, string> = {},
        options: RequestOptions = {},
    ) {
        if (!API_TOKEN) throw new TypeError("CHALLONGE_TOKEN is not set!")

        path = [`${this.tourneyId}`, ...path]
        options.method = method
        options.urlParams = new URLSearchParams({ api_key: API_TOKEN, ...urlParams })
        if (!options.timeout) options.timeout = TIMEOUT
        if (!options.headers) options.headers = {}
        options.headers["Content-Type"] = "application/json; charset=utf-8"
        return request(`https://${SERVER}/tournaments/${path.join("/")}.json`, options)
            .then((v) => v.json() as Promise<any>)
            .catch((error) => this.onError(error))
    }

    async start() {
        const response = await this.challongeRequest("POST", ["start"], {
            include_participants: "1",
            include_matches: "1",
        })
        return this.extractTournament(response.tournament)
    }

    async getTournament() {
        const response = await this.challongeRequest("GET", [], {
            include_participants: "1",
            include_matches: "1",
        })
        return this.extractTournament(response.tournament)
    }

    async addParticipant(name: string, misc: string) {
        const body = JSON.stringify({ participant: { name, misc } })
        const response = await this.challongeRequest("POST", ["participants"], {}, { body })
        return Object.values(this.extractParticipants([response]))[0]
    }

    async removeParticipant(participantId: string | number) {
        const response = await this.challongeRequest("DELETE", ["participants", `${participantId}`])
        return Object.values(this.extractParticipants([response]))[0]
    }

    async getMatches() {
        const response = await this.challongeRequest("GET", ["matches"])
        return this.extractMatches(response)
    }

    async getParticipants() {
        const response = await this.challongeRequest("GET", ["participants"])
        return this.extractParticipants(response)
    }

    async startMatch(matchId: string | number) {
        const response = await this.challongeRequest("POST", ["matches", `${matchId}`, "mark_as_underway"])
        return Object.values(this.extractMatches([response]))[0]
    }

    async updateMatch(matchId: string | number, score: string, winner_id: number) {
        const body = JSON.stringify({ match: { scores_csv: !score ? "0-0" : score, winner_id } })
        const response = await this.challongeRequest("PUT", ["matches", `${matchId}`], {}, { body })
        return Object.values(this.extractMatches([response]))[0]
    }

    protected async onError(error: unknown): Promise<never> {
        if (error instanceof TimeoutError) throw new ChalllongeAPIError("api.timeout", "Challonge API")
        if (error instanceof HTTPError) {
            const resp = (await error.response.json()) as any
            if (resp.errors)
                console.error(`${error.response.url} responded with errors in body!`, resp.errors)
            else console.error(`${error.response.url} responded with a ${error.response.status} status!`)
        } else console.error("Unexpected Challonge API Error", error)

        throw new ChalllongeAPIError(`api.request_failed`, "Challonge API")
    }
}

export type ChallongeTournamentState = "pending" | "underway" | "complete"

export interface ChallongeTournament {
    id: number
    name: string
    url: string
    state: ChallongeTournamentState

    participants: ChallongeParticipants
    matches: ChallongeMatches
}

export type ChallongeMatchState = "pending" | "open" | "complete"

export type ChallongeMatches = Record<string, ChallongeMatch>
export interface ChallongeMatch {
    id: number
    state: ChallongeMatchState
    round: number
    player1_id: number | null
    player2_id: number | null
    started_at: string | null
    winner_id: number | null
    loser_id: number | null
}

export type ChallongeParticipants = Record<string, ChallongeParticipant>
export interface ChallongeParticipant {
    id: number
    name: string
    misc: string
    created_at: string
    seed: number
    active: boolean
}
