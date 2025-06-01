import { BaseInteraction, codeBlock, TextInputStyle } from "discord.js"
import { I18n, TimeUtil, UserError } from "lib"
import { DateTime } from "luxon"

import {
    AbstractTextFormInput,
    AbstractTextFormInputBuilder,
    TextInputsResolvable,
} from "./AbstractTextInput"

export class OffsetInput extends AbstractTextFormInput<number> {
    static builder() {
        return new OffsetInputBuilder()
    }

    getInputted(i18n: I18n, parsed: number) {
        return DateTime.utc({ locale: i18n.locale }).plus({ minutes: parsed }).toFormat("t")
    }

    parse(ctx: BaseInteraction<"cached">, inputted: string) {
        const parsed = TimeUtil.parseOffset(inputted)
        if (parsed === null) throw new UserError("Please input a valid time before continuing.")

        return Promise.resolve(parsed)
    }

    displayParsed(i18n: I18n, parsed: number) {
        return codeBlock(`${this.getInputted(i18n, parsed)} (${TimeUtil.stringifyOffset(parsed)})`)
    }
}

class OffsetInputBuilder extends AbstractTextFormInputBuilder<OffsetInput> {
    constructor() {
        super()
        this.input.setStyle(TextInputStyle.Short)
        this.input.setMinLength(3)
        this.input.setMaxLength(15)
    }

    protected builder(inputs: TextInputsResolvable): OffsetInput {
        return new OffsetInput(this.id!, this.required, inputs)
    }
}
