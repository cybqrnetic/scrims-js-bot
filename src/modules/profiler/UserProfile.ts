import { DocumentType, Prop } from "@typegoose/typegoose"
import { Guild, userMention } from "discord.js"
import { DateTime } from "luxon"
import { Types } from "mongoose"

import { DB, Document, modelClass, MojangClient, TimeUtil } from "lib"

export interface RankedStats {
    elo: number
    wins: number
    losses: number
    draws: number
    winStreak: number
    bestWinStreak: number
}

export interface ParsedUser {
    id: string
    name: string
}

@Document("UserProfile", "userprofiles")
class UserProfileClass {
    static parseUser(resolvable: string, guild?: Guild): ParsedUser | undefined {
        const id = this.resolveId(resolvable)
        if (id) return { id, name: this.getUsername(id)! }

        const member = guild?.members.cache.find((member) => member.displayName === resolvable)
        if (member) return { id: member.id, name: member.user.username }
    }

    static resolveId(resolvable: string) {
        if (resolvable in idToName) return resolvable
        return nameToId[resolvable.toLowerCase()]
    }

    static getUsername(userId: string) {
        return idToName[userId]
    }

    static getNames() {
        return Object.values(idToName)
    }

    static getIds() {
        return Object.keys(idToName)
    }

    @Prop({ type: Types.Long, required: true })
    _id!: string

    @Prop({ required: true })
    username!: string

    @Prop({ required: true })
    joinedAt!: Date

    @Prop({ type: Types.UUID })
    mcUUID?: string

    @Prop({ required: false })
    offset?: number

    @Prop({ required: false })
    timezone?: string

    getCurrentTime() {
        if (!this.offset) return undefined
        return DateTime.utc().plus({ minutes: this.offset })
    }

    getOffset() {
        if (this.timezone) return DateTime.now().setZone(this.timezone).offset
        return this.offset
    }

    getUTCOffset() {
        if (!this.offset) return undefined
        return TimeUtil.stringifyOffset(this.offset)
    }

    async fetchMCUsername() {
        if (!this.mcUUID) return undefined
        return MojangClient.uuidToName(this.mcUUID)
    }

    @Prop({ type: Object, required: false })
    ranked?: Record<string, Partial<RankedStats>>

    mention() {
        return userMention(this._id)
    }
}

export const UserProfile = modelClass(UserProfileClass)
export type UserProfile = DocumentType<UserProfileClass>

const idToName: Record<string, string> = {}
const nameToId: Record<string, string> = {}

function updateCache(profile: UserProfile) {
    idToName[profile._id] = profile.username
    nameToId[profile.username.toLowerCase()] = profile._id
}

function clearCache(id: Types.Long) {
    const name = idToName[id.toString()]
    delete idToName[id.toString()]
    if (name) delete nameToId[name.toLowerCase()]
}

DB.addStartupTask(async () => {
    UserProfile.watcher()
        .on("insert", (doc) => updateCache(doc))
        .on("update", (_, __, doc) => doc && updateCache(doc))
        .on("delete", (id) => clearCache(id as Types.Long))

    await UserProfile.watcher().initialized()
    const profiles = await UserProfile.find({}, { username: 1 })
    profiles.forEach(updateCache)
})
