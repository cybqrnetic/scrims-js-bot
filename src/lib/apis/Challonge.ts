import { LocalizedError } from "../utils/LocalizedError"
import { HTTPError, RequestOptions, TimeoutError, request } from "./request"

export class ChalllongeAPIError extends LocalizedError {}

const API_TOKEN = process.env["CHALLONGE_TOKEN"]!
const SERVER = "api.challonge.com/v1"
const TIMEOUT = 7000

export class ChallongeBracketClient {
    static readonly Error = ChalllongeAPIError
    constructor(readonly tourneyId: string | number) {}

    protected extractParticipants(participants: ParticipantResponse[] = []) {
        return Object.fromEntries(participants.map((v) => [v.participant.id, v.participant]))
    }

    protected extractMatches(matches: MatchResponse[] = []) {
        return Object.fromEntries(matches.map((v) => [v.match.id, v.match]))
    }

    protected extractTournament({ tournament }: TourneyResponse): ChallongeTournament {
        return {
            ...tournament,
            matches: this.extractMatches(tournament.matches),
            participants: this.extractParticipants(tournament.participants),
        }
    }

    private async request<T>(
        method: "GET" | "POST" | "PUT" | "DELETE",
        path: string[],
        urlParams: Record<string, string> = {},
        options: RequestOptions = {},
    ) {
        path = [`${this.tourneyId}`, ...path]
        urlParams["api_key"] = API_TOKEN

        if (!options.timeout) options.timeout = TIMEOUT
        if (!options.headers) options.headers = {}

        options.headers["Content-Type"] = "application/json; charset=utf-8"
        options.urlParams = urlParams
        options.method = method

        return request(`https://${SERVER}/tournaments/${path.join("/")}.json`, options)
            .then((v) => v.json() as Promise<T>)
            .catch((error) => this.onError(error))
    }

    async start() {
        const response = await this.request<TourneyResponse>("POST", ["start"], {
            include_participants: "1",
            include_matches: "1",
        })
        return this.extractTournament(response)
    }

    async getTournament() {
        const response = await this.request<TourneyResponse>("GET", [], {
            include_participants: "1",
            include_matches: "1",
        })
        return this.extractTournament(response)
    }

    async addParticipant(name: string, misc: string) {
        const body = JSON.stringify({ participant: { name, misc } })
        const response = await this.request<ParticipantResponse>("POST", ["participants"], {}, { body })
        return response.participant
    }

    async removeParticipant(participantId: string | number) {
        const response = await this.request<ParticipantResponse>("DELETE", [
            "participants",
            `${participantId}`,
        ])
        return response.participant
    }

    async getMatches() {
        const response = await this.request<MatchResponse[]>("GET", ["matches"])
        return this.extractMatches(response)
    }

    async getParticipants() {
        const response = await this.request<ParticipantResponse[]>("GET", ["participants"])
        return this.extractParticipants(response)
    }

    async startMatch(matchId: string | number) {
        const path = ["matches", `${matchId}`, "mark_as_underway"]
        const response = await this.request<MatchResponse>("POST", path)
        return response.match
    }

    async updateMatch(matchId: string | number, score: string, winner_id: number) {
        const body = JSON.stringify({ match: { scores_csv: !score ? "0-0" : score, winner_id } })
        const response = await this.request<MatchResponse>("PUT", ["matches", `${matchId}`], {}, { body })
        return response.match
    }

    protected async onError(error: unknown): Promise<never> {
        if (error instanceof TimeoutError) throw new ChalllongeAPIError("api.timeout", "Challonge API")
        if (error instanceof HTTPError) {
            const resp = (await error.response.json()) as ErrorResponse
            if (resp.errors)
                console.error(`${error.response.url} responded with errors in body!`, resp.errors)
            else console.error(`${error.response.url} responded with a ${error.response.status} status!`)
        } else console.error("Unexpected Challonge API Error", error)

        throw new ChalllongeAPIError(`api.request_failed`, "Challonge API")
    }
}

interface ErrorResponse {
    errors?: string[]
}

type MatchResponse = { match: ChallongeMatch }
type ParticipantResponse = { participant: ChallongeParticipant }
type TourneyResponse = {
    tournament: ChallongeTournament & { participants: ParticipantResponse[]; matches: MatchResponse[] }
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
