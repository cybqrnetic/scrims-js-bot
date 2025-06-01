import {
    BaseInteraction,
    ContainerBuilder,
    MessageComponentInteraction,
    ModalBuilder,
    ModalSubmitInteraction,
} from "discord.js"

import { ExchangeState } from "../exchange"

/**
 * Generic form component the can add components to messages and modals, and handle
 * the resulting interactions using the user-bound persistent state.
 */
export interface FormComponent {
    /**
     * Indicate this component is in a state that can be submitted.
     */
    isSubmittable(state: ExchangeState): boolean
    getResult(ctx: BaseInteraction<"cached">, state: ExchangeState): { label: string; value?: string }

    addModalComponent?: (ctx: BaseInteraction<"cached">, state: ExchangeState, modal: ModalBuilder) => void
    addMessageComponents?: (
        ctx: BaseInteraction<"cached">,
        state: ExchangeState,
        container: ContainerBuilder,
        componentId: string,
    ) => void

    handleComponent?: (interaction: MessageComponentInteraction<"cached">, state: ExchangeState) => unknown
    handleModal?: (interaction: ModalSubmitInteraction<"cached">, state: ExchangeState) => unknown
}

export interface FormComponentBuilder {
    build(): FormComponent
}
