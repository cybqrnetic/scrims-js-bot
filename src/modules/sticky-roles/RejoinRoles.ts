import { DocumentType, getModelForClass, Prop } from "@typegoose/typegoose"
import { DB, Document } from "lib"
import { Types } from "mongoose"

class RejoinRolesCache {
    private cache: Record<string, Set<string>> = {}

    public RejoinRolesCache() {
        DB.addStartupTask(async () => {
            UserRejoinRoles.watcher()
                .on("insert", (doc) => this.update(doc))
                .on("update", (_, __, doc) => doc && this.update(doc))
                .on("delete", (id) => this.delete(id as Types.Long))

            await UserRejoinRoles.watcher().initialized()
            for (const doc of await UserRejoinRoles.find()) {
                this.update(doc)
            }
        })
    }

    private update(doc: UserRejoinRoles) {
        this.cache[doc._id] = new Set(doc.roles.map((v) => v.toString()))
    }

    private delete(id: Types.Long) {
        delete this.cache[id.toString()]
    }

    public get(userId: string) {
        return this.cache[userId]
    }
}

@Document("UserRejoinRoles", "rejoinroles")
class RejoinRolesClass {
    static cache = new RejoinRolesCache()

    @Prop({ type: Types.Long, required: true })
    _id!: string

    @Prop({ type: [Types.Long], required: true })
    roles!: Types.Long[]

    getRoles() {
        return this.roles.map((v) => v.toString())
    }
}

export const UserRejoinRoles = getModelForClass(RejoinRolesClass)
export type UserRejoinRoles = DocumentType<RejoinRolesClass>
