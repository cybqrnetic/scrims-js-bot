import { BaseInteraction, type MessageComponentInteraction, type ModalSubmitInteraction } from "discord.js"
import { Component, redis, SequencedAsyncExecutor, UserError } from "lib"
import { ExchangeState, ExchangeStateImpl } from "./ExchangeState"

const EXPIRATION = 15 * 60

export abstract class AbstractExchangeHandler {
    protected readonly states = new Map<string, ExchangeStateImpl>()
    protected readonly userSync = new SequencedAsyncExecutor()

    constructor(protected readonly customId: string) {}

    protected abstract handleComponent(interaction: MessageComponentInteraction<"cached">): unknown

    protected abstract handleModal(interaction: ModalSubmitInteraction<"cached">): unknown

    getId() {
        return this.customId
    }

    register() {
        Component({
            builder: this.customId,
            handleComponent: (i) => this.handleComponent(i),
            handleModalSubmit: (i) => this.handleModal(i),
        })
        return this
    }

    protected async oncePerUser<T>(ctx: BaseInteraction<"cached">, task: () => Promise<T>) {
        return this.userSync.submit(ctx.user.id, task)
    }

    protected async useState<T>(ctx: BaseInteraction<"cached">, action: (state: ExchangeState) => T) {
        return this.oncePerUser(ctx, async () => {
            const state = await this.getState(ctx.args.shift())

            try {
                return await action(state)
            } finally {
                const stateId = state.getId()
                if (stateId !== null) {
                    this.initState(stateId, state)
                }
            }
        })
    }

    private async getState(id?: string) {
        if (!id || id === "null") return new ExchangeStateImpl()

        const state = this.states.get(id)
        if (state !== undefined) return state

        const data = await redis.get(`form:${id}`)
        if (!data) throw new UserError("Unknown FormState")

        return new ExchangeStateImpl(id, JSON.parse(data))
    }

    private initState(id: string, state: ExchangeStateImpl) {
        this.states.set(id, state)
        clearTimeout(state.expiration)
        state.expiration = setTimeout(() => this.removeState(id), EXPIRATION * 1000)
        redis.setEx(`form:${id}`, EXPIRATION, JSON.stringify(state)).catch(console.error)
    }

    protected removeState(id: string) {
        const state = this.states.get(id)
        if (state !== undefined) {
            clearTimeout(state.expiration)
            this.states.delete(id)
            redis.del(`form:${id}`).catch(() => null)
        }
    }
}
