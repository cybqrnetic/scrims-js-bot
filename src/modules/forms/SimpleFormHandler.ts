import { BaseInteraction, BaseMessageOptions, type MessageComponentInteraction } from "discord.js"
import { MessageOptionsBuilder } from "lib"

import { AbstractFormHandler } from "./AbstractFormHandler"
import { ExchangeState } from "./exchange"
import { FormComponent } from "./input"

type StateInitCall = (ctx: BaseInteraction<"cached">, state: ExchangeState) => Promise<number | void>
type FormVerifyCall = (ctx: BaseInteraction<"cached">, state?: ExchangeState) => Promise<unknown>
type FormFinishCall = (
    interaction: MessageComponentInteraction<"cached">,
    state: ExchangeState,
) => Promise<BaseMessageOptions | void>

class FormExchangeBuilder {
    private notes?: string
    private color?: number
    private init?: StateInitCall
    private verify?: FormVerifyCall
    private finish?: FormFinishCall
    private pages: FormComponent[][] = []

    constructor(
        private readonly customId: string,
        private readonly title: string,
    ) {}

    setNotes(notes: string) {
        this.notes = notes
        return this
    }

    setColor(color: number) {
        this.color = color
        return this
    }

    onInit(init: StateInitCall) {
        this.init = init
        return this
    }

    onVerify(verify: FormVerifyCall) {
        this.verify = verify
        return this
    }

    onFinish(finish: FormFinishCall) {
        this.finish = finish
        return this
    }

    addPage(...inputs: FormComponent[]) {
        this.pages.push(inputs)
        return this
    }

    register() {
        return new SimpleFormHandler(
            this.customId,
            this.title,
            this.pages,
            this.notes,
            this.color,
            this.init,
            this.verify,
            this.finish,
        ).register()
    }
}

const DEFAULT_FINISH = new MessageOptionsBuilder().setContent("Response Submitted.")

export class SimpleFormHandler extends AbstractFormHandler {
    static builder(customId: string, title: string) {
        return new FormExchangeBuilder(customId, title)
    }

    protected readonly init?: StateInitCall
    protected readonly verify?: FormVerifyCall
    protected readonly finish?: FormFinishCall

    constructor(
        customId: string,
        title: string,
        pages: FormComponent[][],
        notes?: string,
        color?: number,
        init?: StateInitCall,
        verify?: FormVerifyCall,
        finish?: FormFinishCall,
    ) {
        super(customId, title, pages, notes, color)
        this.init = init
        this.verify = verify
        this.finish = finish
    }

    protected onInit(ctx: BaseInteraction<"cached">, state: ExchangeState) {
        return this.init?.(ctx, state)
    }

    protected onVerify(ctx: BaseInteraction<"cached">) {
        return this.verify?.(ctx)
    }

    protected async onFinish(interaction: MessageComponentInteraction<"cached">, state: ExchangeState) {
        return (await this.finish?.(interaction, state)) ?? DEFAULT_FINISH
    }
}
