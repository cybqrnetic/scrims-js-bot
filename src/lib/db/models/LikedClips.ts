import {
    DiscordIdProp,
    Document,
    Prop,
    SchemaDocument,
    getSchemaFromClass,
    modelSchemaWithCache,
} from "../util"

@Document("LikedClips", "likedclips")
class LikedClipsSchema {
    @DiscordIdProp({ required: true })
    _id!: string

    @Prop({ type: Date, default: Date.now, expires: "7d" })
    sentAt!: Date
}

const schema = getSchemaFromClass(LikedClipsSchema)
export const LikedClips = modelSchemaWithCache(schema, LikedClipsSchema)
export type LikedClips = SchemaDocument<typeof schema>
