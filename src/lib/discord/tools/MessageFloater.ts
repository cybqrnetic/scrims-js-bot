import {
    BaseMessageOptions,
    DMChannel,
    Events,
    Message,
    NonThreadGuildBasedChannel,
    TextChannel,
} from "discord.js"
import { SequencedAsync } from "../../utils/SequencedAsync"
import { ScrimsBot } from "../ScrimsBot"

export type GetMessageCall = () => BaseMessageOptions

export class MessageFloater {
    message: Message | undefined
    channel: TextChannel | null

    protected getMessageCall
    protected msgCreateHandler
    protected channelDeleteHandler
    protected resendTimeout?: NodeJS.Timeout

    constructor(message: Message, getMessageCall: GetMessageCall) {
        this.getMessageCall = getMessageCall
        this.channel = message.channel as TextChannel
        this.message = message

        this.msgCreateHandler = (m: Message) => this.onMessageCreate(m).catch(console.error)
        this.bot?.on(Events.MessageCreate, this.msgCreateHandler)

        this.channelDeleteHandler = (c: DMChannel | NonThreadGuildBasedChannel) =>
            this.onChannelDelete(c).catch(console.error)
        this.bot?.on(Events.ChannelDelete, this.channelDeleteHandler)
    }

    get bot() {
        return (this.channel?.client as ScrimsBot) ?? null
    }

    get channelId() {
        return this.channel?.id
    }

    async onMessageCreate(message: Message) {
        if (message.channelId === this.channelId)
            if (message.author.id !== message.client.user?.id) await this.send()
    }

    async onChannelDelete(channel: DMChannel | NonThreadGuildBasedChannel) {
        if (this.channelId === channel.id) this.destroy()
    }

    @SequencedAsync({ merge: true })
    async send(unstack = true) {
        clearTimeout(this.resendTimeout)

        if (this.channel) {
            await this.message?.delete()?.catch(() => null)
            this.message = await this.channel.send(this.getMessageCall())

            // 7 minutes is how long it takes too unstack Discord messages
            if (unstack)
                this.resendTimeout = setTimeout(() => this.send(false).catch(console.error), 7 * 60 * 1000)
        }
    }

    destroy() {
        this.bot?.off(Events.MessageCreate, this.msgCreateHandler)
        this.bot?.off(Events.ChannelDelete, this.channelDeleteHandler)
        clearTimeout(this.resendTimeout)
        this.message?.delete()?.catch(() => null)
        this.channel = null
    }
}
