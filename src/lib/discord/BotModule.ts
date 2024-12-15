import { DiscordBot } from "./DiscordBot"

export class BotModule {
    static readonly instances: Record<string, BotModule> = {}
    static getInstance<T extends BotModule>(this: (new () => T) & typeof BotModule): T {
        if (!(this.name in this.instances)) {
            const instance = new this() as T
            this.instances[this.name] = instance
            DiscordBot.useBot((bot) => instance.setBot(bot))
            return instance
        }
        return this.instances[this.name] as T
    }

    protected readonly bot!: DiscordBot

    private setBot(bot: DiscordBot) {
        Object.defineProperty(this, "bot", { value: bot })
        this.bot.on("ready", () => this.onReady())
        this.bot.on("initialized", () => this.onInitialized())
        this.addListeners()
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    protected addListeners() {}

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    protected async onReady() {}

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    protected async onInitialized() {}
}
