import fs from "fs/promises"
import { glob } from "glob"
import path from "path"

const DIST = path.join(process.cwd(), "dist", "src")
const FILES = "/**/*.js"

export class ModuleLoader {
    private readonly cache: string
    private readonly cachedModules: Promise<boolean>
    private readonly modules: string[] = []

    constructor(command: string) {
        this.cache = `dist/.${command}_modules`
        this.cachedModules =
            process.env["NODE_ENV"] === "production"
                ? fs
                      .readFile(this.cache, "utf8")
                      .catch(() => null)
                      .then(async (data) => {
                          if (data == null) return false
                          const cached = JSON.parse(data) as string[]
                          await Promise.all(cached.map((path) => this.loadNow(path)))
                          return true
                      })
                : Promise.resolve(false)
    }

    async load(dir: string, exclude: string[] = []) {
        if (!(await this.cachedModules)) {
            const paths = await glob(`${dir}${FILES}`, {
                cwd: DIST,
                ignore: exclude.map((v) => v + FILES),
            })

            const access = fs.access(`${DIST}/${dir}.js`)
            if (await access.then(() => true).catch(() => false)) {
                paths.push(`${dir}.js`)
            }

            await Promise.all(paths.map((v) => this.loadNow(v)))
            await fs.writeFile(this.cache, JSON.stringify(this.modules)).catch(console.error)
        }
    }

    private async loadNow(name: string) {
        this.modules.push(name)
        await import(`../../${name}`)
    }

    getLoaded() {
        return this.modules
    }
}
