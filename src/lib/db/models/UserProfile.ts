import { DateTime } from "luxon"
import { MojangClient } from "../../apis/Mojang"
import { TimeUtil } from "../../utils/TimeUtil"

import {
    DiscordIdProp,
    Document,
    Prop,
    SchemaDocument,
    UuidProp,
    getSchemaFromClass,
    modelSchemaWithCache,
} from "../util"

@Document("UserProfile", "userprofiles")
class UserProfileSchema {
    static getUsername(id: string) {
        return UserProfile.cache.get(id)?.username
    }

    @DiscordIdProp({ required: true })
    _id!: string

    @Prop({ type: String, required: true })
    username!: string

    @Prop({ type: Date, required: true })
    joinedAt!: Date

    @UuidProp({ required: false })
    mcUUID?: string

    @Prop({ type: Number, required: false })
    offset?: number

    getCurrentTime() {
        if (!this.offset) return undefined
        return DateTime.now().plus({ minutes: this.offset })
    }

    getUTCOffset() {
        if (!this.offset) return undefined
        return TimeUtil.stringifyOffset(this.offset)
    }

    async fetchMCUsername() {
        if (!this.mcUUID) return undefined
        return MojangClient.uuidToName(this.mcUUID)
    }
}

const schema = getSchemaFromClass(UserProfileSchema)
export const UserProfile = modelSchemaWithCache(schema, UserProfileSchema)
export type UserProfile = SchemaDocument<typeof schema>
