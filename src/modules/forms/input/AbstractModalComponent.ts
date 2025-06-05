import {
    ActionRowBuilder,
    APIComponentInModalActionRow,
    BaseInteraction,
    BaseModalData,
    codeBlock,
    ContainerBuilder,
    ModalBuilder,
    ModalSubmitInteraction,
} from "discord.js"
import { I18n, LocalizedError, UserError } from "lib"

import { Emojis } from "@Constants"
import { ExchangeState } from "../exchange"
import { FormComponent } from "./FormComponent"

interface FormValue<V, I> {
    value?: V
    inputted?: I
    error?: string | unknown[] | null
}

export abstract class AbstractModalComponent<D extends BaseModalData, I, V> implements FormComponent {
    constructor(
        protected readonly id: string,
        protected readonly required: boolean,
    ) {}

    getValue(state: ExchangeState): V | undefined {
        return state.get<FormValue<V, I>>(this.id)?.value
    }

    isValid(state: ExchangeState) {
        const data = state.get<FormValue<V, I>>(this.id)
        return !data || data.error === undefined
    }

    setValue(state: ExchangeState, value: V) {
        state.set(this.id, { value })
    }

    protected abstract label(i18n: I18n): string
    protected abstract component(i18n: I18n, parsed?: V, inputted?: I): APIComponentInModalActionRow

    protected abstract getInput(data: D): I | undefined
    protected abstract displayInputted(i18n: I18n, inputted: I): string
    protected abstract displayParsed(i18n: I18n, parsed: V): string
    protected abstract parse(ctx: BaseInteraction<"cached">, inputted: I): Promise<V>

    /** @override */
    async handleModal(interaction: ModalSubmitInteraction<"cached">, state: ExchangeState) {
        const inputted = this.getInput(interaction.fields.getField(this.id) as unknown as D)
        if (inputted === undefined) {
            state.delete(this.id)
        } else {
            state.set(this.id, await this.parseSafe(interaction, inputted))
        }
    }

    private async parseSafe(interaction: BaseInteraction<"cached">, inputted: I): Promise<FormValue<V, I>> {
        try {
            return { value: await this.parse(interaction, inputted) }
        } catch (error) {
            if (error instanceof UserError) {
                return { inputted, error: error.message }
            } else if (error instanceof LocalizedError) {
                // eslint-disable-next-line @typescript-eslint/no-base-to-string
                return { inputted, error: [error.message, ...error.params.map((v) => v && v.toString())] }
            } else {
                console.error(error)
                return { inputted, error: null }
            }
        }
    }

    /** @override */
    isSubmittable(state: ExchangeState) {
        if (!this.required) return true

        const data = state.get<FormValue<V, I>>(this.id)
        return data !== undefined && data.error === undefined
    }

    /** @override */
    getResult(ctx: BaseInteraction<"cached">, state: ExchangeState) {
        const label = this.label(ctx.i18n)
        const value = this.getValue(state)
        return { label, value: value === undefined ? undefined : this.displayParsed(ctx.i18n, value) }
    }

    /** @override */
    addModalComponent(ctx: BaseInteraction<"cached">, state: ExchangeState, modal: ModalBuilder) {
        const data = state.get<FormValue<V, I>>(this.id)
        modal.addComponents(
            new ActionRowBuilder({
                components: [this.component(ctx.i18n, data?.value, data?.inputted)],
            }),
        )
    }

    /** @override */
    addMessageComponents(ctx: BaseInteraction<"cached">, state: ExchangeState, container: ContainerBuilder) {
        const label = this.label(ctx.i18n)

        const data = state.get<FormValue<V, I>>(this.id)
        if (data && data.error === undefined) {
            const stringified = this.displayParsed(ctx.i18n, data.value!)
            container.addTextDisplayComponents((text) => text.setContent(`### ${label}\n${stringified}`))
            return
        }

        const inputted = data ? this.displayInputted(ctx.i18n, data.inputted!) : " "
        container.addTextDisplayComponents((text) => text.setContent(`### ${label}\n${codeBlock(inputted)}`))

        const error = data
            ? Array.isArray(data.error)
                ? ctx.i18n.get(data.error[0] as string, ...data.error.slice(1))
                : (data.error ?? "Unexpected error while parsing your input.")
            : "Please fill this field."

        container.addTextDisplayComponents((text) => text.setContent(`-# ${Emojis.x}  ${error}`))
    }
}
