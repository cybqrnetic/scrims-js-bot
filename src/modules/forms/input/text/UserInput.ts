import { BaseInteraction, TextInputStyle, userMention } from "discord.js"
import { I18n, UserError } from "lib"

import { ParsedUser, UserProfile } from "@module/profiler"
import {
    AbstractTextFormInput,
    AbstractTextFormInputBuilder,
    TextInputsResolvable,
} from "./AbstractTextInput"

export class UserInput extends AbstractTextFormInput<ParsedUser[]> {
    static builder() {
        return new UserInputBuilder()
    }

    constructor(
        id: string,
        required: boolean,
        inputs: TextInputsResolvable,
        readonly min: number,
        readonly max: number,
    ) {
        super(id, required, inputs)
    }

    getInputted(i18n: I18n, parsed: ParsedUser[]) {
        return parsed.map((v) => `${v.name}`).join(" ")
    }

    parse(ctx: BaseInteraction<"cached">, inputted: string) {
        const names = inputted.split(/[\s,]+/)
        if (names.length < this.min) throw new UserError(`You must provide at least ${this.min} name(s).`)
        if (names.length > this.max) throw new UserError(`You can provide at most ${this.max} name(s).`)

        return Promise.resolve(
            names.map((name) => {
                const user = UserProfile.parseUser(name, ctx.guild)
                if (!user) throw new UserError(`User by the name of "${name}" not found.`)
                return user
            }),
        )
    }

    displayParsed(i18n: I18n, parsed: ParsedUser[]) {
        return (
            parsed
                .slice(0, 15)
                .map((v) => `- ${userMention(v.id)} (${v.name})`)
                .join("\n") + (parsed.length > 15 ? `\nAnd ${parsed.length - 15} more...` : "")
        )
    }
}

class UserInputBuilder extends AbstractTextFormInputBuilder<UserInput> {
    protected min = 1
    protected max = 1

    setMin(min: number) {
        if (min < 1) throw new Error("Min value must be at least 1.")

        this.min = min
        return this
    }

    setMax(max: number) {
        if (max < 1) throw new Error("Max value must be at least 1.")

        this.max = max
        return this
    }

    protected builder(inputs: TextInputsResolvable): UserInput {
        return new UserInput(this.id!, this.required, inputs, this.min, this.max)
    }

    build(): UserInput {
        if (this.min > this.max) throw new Error("Min value must be less than or equal to max value.")

        if (this.max > 1) {
            this.input.setPlaceholder("Discord usernames separated by line breaks, spaces or commas.")
            this.input.setStyle(TextInputStyle.Paragraph)
        } else {
            this.input.setPlaceholder("Discord username.")
            this.input.setStyle(TextInputStyle.Short)
        }

        return super.build()
    }
}
