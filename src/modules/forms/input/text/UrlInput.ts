import { BaseInteraction, codeBlock, TextInputStyle } from "discord.js"
import { I18n, TextUtil, UserError } from "lib"

import {
    AbstractTextFormInput,
    AbstractTextFormInputBuilder,
    TextInputsResolvable,
} from "./AbstractTextInput"

export class UrlInput extends AbstractTextFormInput<string> {
    static builder() {
        return new UrlInputBuilder()
    }

    getInputted(i18n: I18n, parsed: string) {
        return parsed
    }

    parse(ctx: BaseInteraction<"cached">, inputted: string) {
        if (!TextUtil.isValidHttpUrl(inputted))
            throw new UserError("Please input a valid URL before continuing.")

        return Promise.resolve(inputted)
    }

    displayParsed(i18n: I18n, parsed: string) {
        return codeBlock(parsed)
    }
}

class UrlInputBuilder extends AbstractTextFormInputBuilder<UrlInput> {
    constructor() {
        super()
        this.input.setStyle(TextInputStyle.Short)
        this.input.setMinLength(10)
    }

    protected builder(inputs: TextInputsResolvable) {
        return new UrlInput(this.id!, this.required, inputs)
    }
}
