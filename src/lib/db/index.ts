import mongoose from "mongoose"
import mongooseLong from "mongoose-long"

mongooseLong(mongoose)
mongoose.Schema.Types.Long.get((v?: mongoose.Types.Long) => v?.toString())

let startupTasks: (() => Promise<unknown>)[] | null = []

export class DB {
    static addStartupTask<T>(task: () => T) {
        if (startupTasks === null) {
            throw new Error("Already connected to the database, cannot add startup task.")
        }

        const result = {} as { value: Awaited<T> }
        startupTasks.push(async () => {
            result.value = await task()
        })
        return result
    }
}

export async function connectDatabase() {
    await mongoose
        .connect(process.env["MONGO_URI"]!, { connectTimeoutMS: 7000, serverSelectionTimeoutMS: 7000 })
        .then(({ connection }) => {
            connection.on("error", console.error)
            console.log(`Connected to database ${connection.name}.`)
        })

    await Promise.all(startupTasks!.map((task) => task()))
    startupTasks = null
}

export async function disconnectDatabase() {
    await mongoose.disconnect()
}

export * from "./DocumentCache"
export * from "./redis"
export * from "./util"
