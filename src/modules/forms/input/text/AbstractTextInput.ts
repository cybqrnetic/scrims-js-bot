import { APITextInputComponent, BaseInteraction, TextInputBuilder, TextInputModalData } from "discord.js"

import { I18n } from "lib"
import { AbstractModalComponent } from "../AbstractModalComponent"
import { FormComponent, FormComponentBuilder } from "../FormComponent"

export type TextInputsResolvable = APITextInputComponent | [string, APITextInputComponent][]
export abstract class AbstractTextFormInput<V> extends AbstractModalComponent<TextInputModalData, string, V> {
    protected inputs?: Record<string, APITextInputComponent>
    protected default: APITextInputComponent

    constructor(id: string, required: boolean, inputs: TextInputsResolvable) {
        super(id, required)
        this.inputs = Array.isArray(inputs) ? Object.fromEntries(inputs) : undefined
        this.default = Array.isArray(inputs) ? this.inputs![I18n.default.locale]! : inputs
    }

    abstract getInputted(i18n: I18n, parsed: V): string

    abstract parse(ctx: BaseInteraction<"cached">, inputted: string): Promise<V>
    abstract displayParsed(i18n: I18n, parsed: V): string

    /** @override */
    getInput(data: TextInputModalData) {
        return data.value === "" ? undefined : data.value
    }

    /** @override */
    displayInputted(i18n: I18n, inputted: string) {
        return inputted
    }

    /** @override */
    label(i18n: I18n) {
        return (this.inputs?.[i18n.locale] ?? this.default).label
    }

    /** @override */
    component(i18n: I18n, parsed?: V, inputted?: string): APITextInputComponent {
        const input = this.inputs?.[i18n.locale] ?? this.default
        return { ...input, value: parsed ? this.getInputted(i18n, parsed) : inputted }
    }
}

export abstract class AbstractTextFormInputBuilder<V extends FormComponent> implements FormComponentBuilder {
    protected id?: string
    protected required = false
    protected input = new TextInputBuilder()
    protected localized?: { label?: string; placeholder?: string }

    setId(id: string) {
        this.id = id
        this.input.setCustomId(id)
        return this
    }

    setLabel(label: string) {
        this.input.setLabel(label)
        return this
    }

    protected localize() {
        return this.localized ?? (this.localized = {})
    }

    setLabelLocalized(label: string) {
        this.localize().label = label
        return this
    }

    setPlaceholder(placeholder: string) {
        this.input.setPlaceholder(placeholder)
        return this
    }

    setPlaceholderLocalized(placeholder: string) {
        this.localize().placeholder = placeholder
        return this
    }

    setRequired(required: boolean) {
        this.required = required
        this.input.setRequired(required)
        return this
    }

    protected abstract builder(inputs: TextInputsResolvable): V

    protected buildLocalized(i18n: I18n) {
        if (this.localized?.label) this.input.setLabel(i18n.get(this.localized.label))
        if (this.localized?.placeholder) this.input.setPlaceholder(i18n.get(this.localized.placeholder))
        return this.input.toJSON()
    }

    build() {
        if (!this.id) {
            throw new Error("ID must be set before building the input.")
        }

        if (!this.localized) return this.builder(this.input.toJSON())
        return this.builder(I18n.getInstances().map((v) => [v.locale, this.buildLocalized(v)]))
    }
}
