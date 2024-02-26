import {
    Client,
    Events,
    Message,
    MessageReaction,
    PartialMessageReaction,
    PartialUser,
    User,
} from "discord.js"
import { EventEmitter } from "events"
import { Base } from "./ScrimsBot"

export class PartialsHandledEventEmitter {
    protected events: EventEmitter = new EventEmitter({ captureRejections: true })
    constructor(protected readonly bot: Client) {
        this.events.on("error", console.error)
        this.bot.on(Events.MessageReactionAdd, (reaction, user) =>
            this.onReaction(reaction, user, Events.MessageReactionAdd),
        )
        this.bot.on(Events.MessageReactionRemove, (reaction, user) =>
            this.onReaction(reaction, user, Events.MessageReactionRemove),
        )
    }

    async resolvePartial(obj: MessageReaction | PartialMessageReaction | User | PartialUser) {
        if (obj.partial) await obj.fetch()
    }

    async onReaction(
        reaction: MessageReaction | PartialMessageReaction,
        user: User | PartialUser,
        event: Events.MessageReactionAdd | Events.MessageReactionRemove,
    ) {
        await this.resolvePartial(reaction)
        await this.resolvePartial(user)
        // @ts-expect-error make into MessageReactionData
        reaction.user = user
        // @ts-expect-error make into MessageReactionData
        reaction.inGuild = () => reaction.message.inGuild()
        this.emit(event, reaction as MessageReactionData)
    }

    protected emit<K extends keyof ThisEvents>(event: K, ...args: ThisEvents[K]): boolean
    protected emit(eventName: string, ...args: unknown[]) {
        return this.events.emit(eventName, ...args)
    }

    on<K extends keyof ThisEvents>(event: K, listener: (...args: ThisEvents[K]) => unknown): this
    on(eventName: string | number, listener: (...args: unknown[]) => void) {
        this.events.on(`${eventName}`, listener)
        return this
    }
}

interface ThisEvents {
    [Events.MessageReactionAdd]: [reactionData: MessageReactionData]
    [Events.MessageReactionRemove]: [reactionData: MessageReactionData]
}

export interface MessageReactionData<InGuild extends boolean = boolean> extends PartialMessageReaction {
    inGuild: () => this is MessageReactionData<true>
    message: Message<InGuild> & Base
    user: User
}
