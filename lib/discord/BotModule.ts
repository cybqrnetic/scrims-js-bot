import { ScrimsBot } from "./ScrimsBot"

export class BotModule {
    static readonly instances: Record<string, BotModule> = {}
    static getInstance<T extends BotModule>(this: (new () => T) & typeof BotModule): T {
        if (!(this.name in this.instances)) {
            const instance = new this() as T
            this.instances[this.name] = instance
            ScrimsBot.useBot((bot) => instance.setBot(bot))
            return instance
        }
        return this.instances[this.name] as T
    }

    protected readonly bot!: ScrimsBot

    private setBot(bot: ScrimsBot) {
        Object.defineProperty(this, "bot", { value: bot })
        this.bot.on("ready", () => this.onReady())
        this.addListeners()
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    protected addListeners() {}

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    protected async onReady() {}
}
