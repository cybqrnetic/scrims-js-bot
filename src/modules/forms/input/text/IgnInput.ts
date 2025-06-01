import { BaseInteraction, codeBlock, TextInputStyle } from "discord.js"

import { ExchangeState } from "@module/forms/exchange"
import { I18n, MojangClient, MojangResolvedUser, UserError } from "lib"
import {
    AbstractTextFormInput,
    AbstractTextFormInputBuilder,
    TextInputsResolvable,
} from "./AbstractTextInput"

export class IgnInput extends AbstractTextFormInput<MojangResolvedUser> {
    static builder() {
        return new IgnInputBuilder()
    }

    async setValueId(state: ExchangeState, uuid: string) {
        const profile = await MojangClient.uuidToProfile(uuid)
        if (profile) {
            this.setValue(state, profile)
        }
    }

    getInputted(i18n: I18n, parsed: MojangResolvedUser) {
        return parsed.name
    }

    async parse(ctx: BaseInteraction<"cached">, inputted: string) {
        const profile = await MojangClient.nameToProfile(inputted)
        if (!profile) throw new UserError("The provided IGN is invalid.")
        return profile
    }

    displayParsed(i18n: I18n, parsed: MojangResolvedUser) {
        return codeBlock(parsed.name)
    }
}

class IgnInputBuilder extends AbstractTextFormInputBuilder<IgnInput> {
    constructor() {
        super()
        this.input.setLabel("Minecraft Username")
        this.input.setStyle(TextInputStyle.Short)
        this.input.setMinLength(3)
        this.input.setMaxLength(16)
    }

    protected builder(inputs: TextInputsResolvable): IgnInput {
        return new IgnInput(this.id!, this.required, inputs)
    }
}
