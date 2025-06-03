import { bot, Document, modelClass, TimeUtil } from "lib"

import { ROLE_APP_HUB } from "@Constants"
import { Config } from "@module/config"
import { DocumentType, Prop } from "@typegoose/typegoose"
import { Types } from "mongoose"

const POSITIONS = record({ Pristine: 10, Prime: 20, Private: 30, Premium: 40 })
const POSITIONS_REVERSED = Object.fromEntries(Object.entries(POSITIONS).map(([key, value]) => [value, key]))

@Document("Vouch", "vouches")
class VouchClass {
    private static updateCalls: ((vouch: Vouch) => unknown)[] = []
    static onUpdate(call: (vouch: Vouch) => unknown) {
        this.updateCalls.push(call)
    }

    static emitUpdate(vouch: Vouch) {
        this.updateCalls.forEach(async (call) => {
            try {
                await call(vouch)
            } catch (error) {
                console.error(error)
            }
        })
    }

    @Prop({ type: Types.ObjectId, required: true })
    _id!: Types.ObjectId

    @Prop({ type: Types.Long, required: true })
    userId!: string

    @Prop({
        type: Number,
        required: true,
        set: (v: string) => POSITIONS[v],
        get: (v: number) => POSITIONS_REVERSED[v],
    })
    position!: string

    @Prop({ type: Types.Long, required: false })
    executorId!: string

    @Prop({ type: Date, required: true, default: Date.now })
    givenAt!: Date

    @Prop({ type: Number, required: true })
    worth!: number

    @Prop({ type: String, required: false })
    comment?: string

    user() {
        return bot.users.cache.get(this.userId)
    }

    executor() {
        return this.executorId ? bot.users.cache.get(this.executorId) : null
    }

    isPositive() {
        return this.worth > 0
    }

    isPurge() {
        return this.worth === -2
    }

    isVoteOutcome() {
        return !this.executorId
    }

    isHidden() {
        return !this.isPositive() && !this.isVoteOutcome()
    }

    isExpired() {
        if (this.isVoteOutcome()) return false
        const expiration = Vouch.getExpiration(this.position, this.worth)
        return Date.now() >= this.givenAt.valueOf() + expiration
    }

    static getExpiration(rank: string, worth = 1) {
        const name = worth < 0 ? "Devouch" : "Vouch"
        const def = worth < 0 ? 2 * 7 * 24 * 60 * 60 : 4 * 30 * 24 * 60 * 60
        return (durations.get(`${rank} ${name} Expiration`) ?? def) * 1000
    }
}

export const Vouch = modelClass(VouchClass)
export type Vouch = DocumentType<VouchClass>

const REGEX = /(.+) (Vouch|Devouch) Expiration/g
const durations = new Map<string, number>()
Config.cache
    .on("add", (config) => {
        if (config.type.match(REGEX) && config.guildId === ROLE_APP_HUB) {
            durations.set(config.type, TimeUtil.parseDuration(config.value))
        }
    })
    .on("delete", (config) => {
        if (config.guildId === ROLE_APP_HUB) {
            durations.delete(config.type)
        }
    })
