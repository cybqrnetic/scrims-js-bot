import { Client } from "discord.js"
import { bot } from "."

export class BotModule {
    static readonly instances: Record<string, BotModule> = {}
    static getInstance<T extends BotModule>(this: (new () => T) & typeof BotModule): T {
        if (!(this.name in this.instances)) {
            const instance = new this()
            this.instances[this.name] = instance
            instance.setBot(bot)
            return instance
        }
        return this.instances[this.name] as T
    }

    protected readonly bot!: Client

    private setBot(bot: Client) {
        Object.defineProperty(this, "bot", { value: bot })
        this.bot.on("ready", () => this.onReady())
        this.bot.on("initialized", () => this.onInitialized())
        this.addListeners()
    }

    protected addListeners() {}

    protected onReady() {}

    protected onInitialized() {}
}
