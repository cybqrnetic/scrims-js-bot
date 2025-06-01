import { DocumentType, Prop } from "@typegoose/typegoose"
import { Document, modelClassCached } from "lib"
import { Types } from "mongoose"

@Document("LikedClips", "likedclips")
class LikedClipsClass {
    @Prop({ type: Types.Long, required: true })
    _id!: string

    @Prop({ type: Date, default: Date.now, expires: "7d" })
    sentAt!: Date
}

export const LikedClips = modelClassCached(LikedClipsClass)
export type LikedClips = DocumentType<LikedClipsClass>
