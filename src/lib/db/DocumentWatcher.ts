import { DocumentType, ModelType } from "@typegoose/typegoose/lib/types"
import { EventEmitter } from "events"
import { ChangeStream, ChangeStreamDocument, UpdateDescription } from "mongodb"
import { Document } from "mongoose"

let warned = false

export class DocumentWatcher<T, V extends Document = DocumentType<T>> {
    protected events = new EventEmitter({ captureRejections: true })
    protected init = Promise.withResolvers()
    protected stream
    constructor(protected model: ModelType<T>) {
        this.events.on("error", console.error)
        this.model.db.on("open", () => this.events.emit("open"))

        if (process.env["NODE_ENV"] !== "production") {
            if (!warned) {
                console.warn("DocumentWatcher is disabled in development mode!")
                warned = true
            }

            this.init.resolve(null)
            return
        }

        this.stream = this.model.watch<V>(undefined, {
            fullDocument: "updateLookup",
            fullDocumentBeforeChange: "whenAvailable",
            hydrate: true,
        })

        this.stream.on(ChangeStream.ERROR, console.error)
        this.stream.once(ChangeStream.RESUME_TOKEN_CHANGED, () => this.init.resolve(null))
        this.stream.on(ChangeStream.CHANGE, (change: ChangeStreamDocument<V>) => {
            if (change.operationType === "insert") this.events.emit("insert", change.fullDocument)

            if (change.operationType === "update")
                this.events.emit(
                    "update",
                    change.updateDescription,
                    change.documentKey._id,
                    change.fullDocument,
                )

            if (change.operationType === "delete")
                this.events.emit("delete", change.documentKey._id, change.fullDocumentBeforeChange)
        })
    }

    async initialized() {
        await this.init.promise
    }

    protected resolveDocument(rawDocument: V) {
        return new this.model(rawDocument)
    }

    on<E extends keyof Events<V>>(event: E, listener: (...args: Events<V>[E]) => unknown) {
        this.events.on(event, listener as (...args: unknown[]) => unknown)
        return this
    }
}

interface Events<T extends Document> {
    open: []
    start: []
    insert: [doc: T]
    update: [updateDescription: UpdateDescription, id: unknown, doc?: T]
    delete: [id: unknown, doc?: T]
}
