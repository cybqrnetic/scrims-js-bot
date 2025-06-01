import { BaseInteraction, codeBlock, TextInputStyle } from "discord.js"
import { I18n } from "lib"

import {
    AbstractTextFormInput,
    AbstractTextFormInputBuilder,
    TextInputsResolvable,
} from "./AbstractTextInput"

export class TextInput extends AbstractTextFormInput<string> {
    static builder() {
        return new TextFormInputBuilder()
    }

    getInputted(i18n: I18n, parsed: string) {
        return parsed
    }

    parse(ctx: BaseInteraction<"cached">, inputted: string) {
        return Promise.resolve(inputted)
    }

    displayParsed(i18n: I18n, parsed: string) {
        return codeBlock(parsed)
    }
}

class TextFormInputBuilder extends AbstractTextFormInputBuilder<TextInput> {
    setStyle(style: TextInputStyle) {
        this.input.setStyle(style)
        return this
    }

    setMinLength(minLength: number) {
        this.input.setMinLength(minLength)
        return this
    }

    setMaxLength(maxLength: number) {
        this.input.setMaxLength(maxLength)
        return this
    }

    protected builder(inputs: TextInputsResolvable) {
        return new TextInput(this.id!, this.required, inputs)
    }
}
