import { ROLE_APP_HUB } from "@Constants"
import { ScrimsBot } from "../../discord"

import { TimeUtil } from "../../utils/TimeUtil"
import {
    DiscordIdProp,
    Document,
    Prop,
    SchemaDocument,
    UuidProp,
    getSchemaFromClass,
    modelSchema,
} from "../util"
import { Config } from "./Config"

@Document("Vouch", "vouches")
class VouchSchema {
    @UuidProp({ required: true })
    _id!: string

    @DiscordIdProp({ required: true })
    userId!: string

    @Prop({ type: String, required: true })
    position!: string

    @DiscordIdProp({ required: false })
    executorId!: string

    @Prop({ type: Date, required: true, default: Date.now })
    givenAt!: Date

    @Prop({ type: Number, required: true })
    worth!: number

    @Prop({ type: String, required: false })
    comment!: string

    user() {
        return ScrimsBot.INSTANCE?.users.cache.get(this.userId)
    }

    executor() {
        if (!this.executorId) return null
        return ScrimsBot.INSTANCE?.users.cache.get(this.executorId)
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

const schema = getSchemaFromClass(VouchSchema)
export const Vouch = modelSchema(schema, VouchSchema)
export type Vouch = SchemaDocument<typeof schema>

const REGEX = /(.+) (Vouch|Devouch) Expiration/g
const durations = new Map<string, number>()
Config.cache.on("set", (config) => {
    if (config.type.match(REGEX) && config.guildId === ROLE_APP_HUB) {
        durations.set(config.type, TimeUtil.parseDuration(config.value))
    }
})

Config.cache.on("delete", (config) => {
    if (config.guildId === ROLE_APP_HUB) {
        durations.delete(config.type)
    }
})
