import {
    BaseMessageOptions,
    DMChannel,
    Events,
    Message,
    NonThreadGuildBasedChannel,
    PartialMessage,
    TextChannel,
} from "discord.js"

import { bot } from ".."
import { SequencedAsync } from "../../utils/SequencedAsync"

export type GetMessageCall = () => BaseMessageOptions

export class MessageFloater {
    message: Message | undefined
    channel: TextChannel | null

    protected getMessageCall
    protected messageCreateHandler
    protected messageDeleteHandler
    protected channelDeleteHandler
    protected resendTimeout?: NodeJS.Timeout

    constructor(message: Message, getMessageCall: GetMessageCall) {
        this.getMessageCall = getMessageCall
        this.channel = message.channel as TextChannel
        this.message = message

        this.messageCreateHandler = (m: Message) => this.onMessageCreate(m)
        bot.on(Events.MessageCreate, this.messageCreateHandler)

        this.messageDeleteHandler = (m: Message | PartialMessage) => this.onMessageDelete(m)
        bot.on(Events.MessageDelete, this.messageDeleteHandler)

        this.channelDeleteHandler = (c: DMChannel | NonThreadGuildBasedChannel) => this.onChannelDelete(c)
        bot.on(Events.ChannelDelete, this.channelDeleteHandler)
    }

    get channelId() {
        return this.channel?.id
    }

    onMessageCreate(message: Message) {
        if (message.channelId === this.channelId && message.author.id !== message.client.user?.id)
            this.send().catch(console.error)
    }

    onMessageDelete(message: Message | PartialMessage) {
        if (message.id === this.message?.id) {
            this.message = undefined
            this.send().catch(console.error)
        }
    }

    onChannelDelete(channel: DMChannel | NonThreadGuildBasedChannel) {
        if (this.channelId === channel.id) {
            this.destroy()
        }
    }

    @SequencedAsync({ merge: true })
    async send(unstack = true) {
        clearTimeout(this.resendTimeout)

        if (this.channel) {
            const message = this.message
            this.message = undefined

            await message?.delete()?.catch(() => null)
            this.message = await this.channel.send(this.getMessageCall())

            // 7 minutes is how long it takes too unstack Discord messages
            if (unstack) {
                this.resendTimeout = setTimeout(() => this.send(false).catch(console.error), 7 * 60 * 1000)
            }
        }
    }

    destroy() {
        bot.off(Events.MessageCreate, this.messageCreateHandler)
        bot.off(Events.MessageDelete, this.messageDeleteHandler)
        bot.off(Events.ChannelDelete, this.channelDeleteHandler)

        clearTimeout(this.resendTimeout)
        this.message?.delete()?.catch(() => null)
        this.channel = null
    }
}
