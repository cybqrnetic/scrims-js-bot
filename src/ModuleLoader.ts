import type { BunFile } from "bun"
import { globSync } from "glob"

const FILES = "/**/*.ts"

export class ModuleLoader {
    private readonly cache: BunFile
    private readonly cachedModules: Promise<boolean>
    private readonly modules: string[] = []

    constructor(command: string) {
        this.cache = Bun.file(`node_modules/.${command}_modules`)
        this.cachedModules =
            process.env["NODE_ENV"] === "production"
                ? this.cache
                      .json()
                      .catch(() => false)
                      .then((cached: string[]) => {
                          cached.forEach((path) => this.loadNow(path))
                          return true
                      })
                : Promise.resolve(false)
    }

    async load(dir: string, exclude: string[] = []) {
        if (!(await this.cachedModules)) {
            for (const path of globSync(`${dir}${FILES}`, {
                cwd: __dirname,
                ignore: exclude.map((v) => v + FILES),
            })) {
                this.loadNow(path)
            }
            await Bun.write(this.cache, JSON.stringify(this.modules)).catch(console.error)
        }
    }

    private loadNow(path: string) {
        this.modules.push(path)
        require(`./${path}`)
    }

    getLoaded() {
        return this.modules
    }
}
