import {
    ActionRowBuilder,
    ComponentType,
    SnowflakeUtil,
    TextInputBuilder,
    TextInputModalData,
    codeBlock,
    type Interaction,
} from "discord.js"

import { TextUtil } from "lib"
import { ExchangeInputField } from "./ExchangeInputField"
import { RecallExchangeInteraction } from "./exchange"

export class ExchangeHandlerParser {
    async parseFieldValue<Parsed>(
        interaction: RecallExchangeInteraction,
        field: ExchangeInputField<Parsed>,
        value: string,
    ) {
        if (field.parse && value) return field.parse(interaction, value)
        return undefined
    }

    async parseModalComponents(
        state: ExchangeHandlerState,
        interaction: RecallExchangeInteraction,
        components: TextInputModalData[],
    ) {
        await Promise.all(
            components.map(async (fieldData) => {
                const field = state.getFields().find((field) => field.customId === fieldData.customId)
                if (field) {
                    state.setFieldValue(
                        field.customId,
                        fieldData.value,
                        await this.parseFieldValue(interaction, field, fieldData.value),
                    )
                }
            }),
        )
    }
}

export class ExchangeHandlerStateManager {
    constructor(
        readonly fields: ExchangeInputField<unknown>[],
        readonly getInitialStateCall?: (i: Interaction, s: ExchangeHandlerState) => Promise<unknown>,
    ) {}

    newState() {
        return new ExchangeHandlerState(`${SnowflakeUtil.generate()}`, this.fields)
    }

    fromJSON(json?: string) {
        if (!json) return null
        const { id, index, values } = JSON.parse(json)
        return new ExchangeHandlerState(id, this.fields, index, values)
    }

    async getInitialState(interaction: Interaction) {
        const state = this.newState()
        if (this.getInitialStateCall) await this.getInitialStateCall(interaction, state)
        return state
    }
}

export class ExchangeHandlerState {
    constructor(
        readonly id: string,
        readonly fields: ExchangeInputField<unknown>[],
        public index = 0,
        readonly values: Record<string, { value: string; parsed: unknown }> = {},
    ) {}

    toJSON() {
        return {
            id: this.id,
            index: this.index,
            values: this.values,
        }
    }

    hasState() {
        return Object.values(this.values).length === this.fields.length
    }

    reset() {
        this.index = 0
        Object.values(this.values).forEach((v) => delete v.parsed)
        return this
    }

    getFields() {
        return this.fields
    }

    getFieldValue(customId: string) {
        return this.values[customId]?.parsed
    }

    getFieldInputtedValue(customId: string) {
        return this.values[customId]?.value
    }

    setFieldValue(customId: string, value: string, parsed?: unknown) {
        this.values[customId] = { value, parsed }
    }

    getModalComponentType() {
        return ComponentType.TextInput
    }

    disableNext() {
        if (this.fields.every((field) => this.getFieldInputtedValue(field.customId) === "")) return true
        return this.fields
            .filter((field) => this.getFieldInputtedValue(field.customId) !== "")
            .some((field) => this.getFieldComment(field))
    }

    getFieldComment<Parsed>(field: ExchangeInputField<Parsed>) {
        if (field.comment) return field.comment(this.getFieldValue(field.customId) as Parsed)
    }

    stringifyFieldValue<Parsed>(field: ExchangeInputField<Parsed>, parsed: Parsed, inputted: string) {
        if (field.stringify)
            return TextUtil.limitText(field.stringify(parsed, inputted) ?? inputted, 1024 - 10)
        return codeBlock(TextUtil.limitText(inputted, 1024 - 10))
    }

    getModalComponents(): ActionRowBuilder[] {
        const fields = this.getFields()
            .slice(this.index * 5, this.index * 5 + 5)
            .filter((v) => v)
        if (fields.length === 0) return []
        return fields.map((field) => {
            const component = {
                ...field,
                type: field.type ?? ComponentType.TextInput,
                value: this.getFieldInputtedValue(field.customId) || undefined,
            }
            return new ActionRowBuilder().addComponents(new TextInputBuilder(component))
        })
    }

    getEmbedFields(showComments = false) {
        const fields = this.getFields()
            .filter((field) => this.getFieldInputtedValue(field.customId) !== "")
            .map((field) => {
                const fields = [
                    {
                        name: field.label,
                        value: this.stringifyFieldValue(
                            field,
                            this.getFieldValue(field.customId)!,
                            this.getFieldInputtedValue(field.customId)!,
                        ).substring(0, 1024),
                    },
                ]
                const comment = this.getFieldComment(field)
                if (comment && showComments) fields.push(comment)
                return fields
            })
            .flat()
        return fields
    }
}
