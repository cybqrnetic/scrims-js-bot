import { Channel, GuildChannel } from "discord.js"
import { SequencedAsync } from "../../utils/SequencedAsync"

export class StatusChannel {
    protected id: string
    protected channelDeleteCall
    protected timeoutEnd
    protected waitTimer?: NodeJS.Timeout

    constructor(protected channel: GuildChannel) {
        this.id = channel.id
        this.channelDeleteCall = (channel: Channel) => {
            if (channel.id === this.id) this.destroy()
        }
        this.channel.client.on("channelDelete", this.channelDeleteCall)
        this.timeoutEnd = -1
    }

    public get guildId() {
        return this.channel?.guildId ?? null
    }

    protected destroy() {
        this.channel.client.off("channelDelete", this.channelDeleteCall)
        if (this.waitTimer) clearTimeout(this.waitTimer)
    }

    public postponeUpdate(ms: number, name: string) {
        if (this.waitTimer) clearTimeout(this.waitTimer)
        const timeout = setTimeout(() => this.setName(name).catch(console.error), ms)
        this.waitTimer = timeout
    }

    @SequencedAsync({ merge: true })
    protected async setName(name: string) {
        if (this.channel) await this.channel.setName(name)

        /*
        try {
            if (this.channel) await this.channel.setName(name)
        }catch (error) {
            if (error instanceof RateLimitError) {
                this.timeoutEnd = error.timeout + Date.now()
                this.postponeUpdate(error.timeout, name)
            }else {
                throw error;
            }
        }
        */
    }

    protected async update(name: string) {
        if (!this.channel) return false
        if (this.channel.name === name) return true

        await this.setName(name)
        /*
        if (this.timeoutEnd > Date.now()) this.postponeUpdate(this.timeoutEnd-Date.now(), name)
        else await this.updateBuffer.run(name)
        */
    }
}
