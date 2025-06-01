import { Channel, GuildChannel, RateLimitError } from "discord.js"
import { SequencedAsync } from "../../utils/SequencedAsync"

export class StatusChannel {
    protected id: string
    protected target: string
    protected channelDeleteCall
    protected timeoutEnd
    protected channel?: GuildChannel
    protected waitTimer?: NodeJS.Timeout

    constructor(channel: GuildChannel) {
        this.id = channel.id
        this.channel = channel
        this.target = channel.name
        this.channelDeleteCall = (channel: Channel) => {
            if (channel.id === this.id) this.destroy()
        }
        channel.client.on("channelDelete", this.channelDeleteCall)
        this.timeoutEnd = -1
    }

    get guildId() {
        return this.channel?.guildId ?? null
    }

    destroy() {
        this.channel?.client.off("channelDelete", this.channelDeleteCall)
        if (this.waitTimer) clearTimeout(this.waitTimer)
        this.channel = undefined
    }

    @SequencedAsync()
    protected async sync() {
        try {
            await this.channel?.setName(this.target)
        } catch (error) {
            if (error instanceof RateLimitError) {
                this.waitTimer = setTimeout(() => {
                    this.waitTimer = undefined
                    this.sync().catch(console.error)
                }, error.retryAfter)
            } else {
                throw error
            }
        }
    }

    async update(name: string) {
        if (!this.channel) return false
        if (this.target === name) return true

        this.target = name
        if (!this.waitTimer) await this.sync()
    }
}
