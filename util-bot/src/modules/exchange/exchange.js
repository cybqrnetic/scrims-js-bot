import { ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder } from "discord.js"
import { MessageOptionsBuilder, StateComponentHandler } from "lib"

import { ExchangeHandlerParser, ExchangeHandlerState, ExchangeHandlerStateManager } from "./exchange-state"

/**
 * @typedef {import("discord.js").Interaction & import("lib").CommandHandlerInteractionData & RecallExchangeInteractionData} RecallExchangeInteraction
 * @typedef RecallExchangeInteractionData
 * @property {ExchangeHandler} handler
 * @property {ExchangeHandlerState} state
 */

/** @extends {StateComponentHandler<ExchangeHandlerState>} */
export class ExchangeHandler extends StateComponentHandler {
    /**
     * @param {string} customId
     * @param {string} title
     * @param {EphemeralExchangeInputField[]} fields
     */
    constructor(customId, title, fields) {
        super(
            customId,
            (...args) => this._getModalResponse(...args),
            new ExchangeHandlerStateManager(fields, (i, s) => this.getInitialState(i, s)),
            new ExchangeHandlerParser(),
        )

        /** @readonly */
        this.title = title
    }

    get length() {
        return Math.ceil(this.stateManager.fields.length / 5)
    }

    /**
     * @protected
     * @override
     */
    getNextButton(state, ...args) {
        if (state.index + 1 < this.length)
            return super.getNextButton(state, ...args).setDisabled(state.disableNext())
        return new ButtonBuilder()
            .setLabel("Submit")
            .setCustomId(`${this.getCustomId(state)}/NEXT/SUBMIT`)
            .setDisabled(state.disableNext())
            .setStyle(ButtonStyle.Success)
            .setEmoji("📨")
    }

    /** @protected */
    getEditButton(state) {
        return new ButtonBuilder()
            .setLabel("Edit")
            .setCustomId(`${this.getCustomId(state)}//EDIT`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🖊️")
    }

    /**
     * @protected
     * @override
     */
    getButtons(state, response) {
        return [
            this.getNextButton(state, response.nextOption),
            this.getEditButton(state),
            this.getBackButton(state, response.backOption),
            this.getCancelButton(state, response.cancelOption),
        ].filter((v) => v)
    }

    /**
     * @protected
     * @param {ExchangeHandlerState} state
     */
    getModal(state) {
        const components = state.getModalComponents()
        if (components.length === 0) return null
        return new ModalBuilder()
            .setTitle(this.title)
            .setCustomId(`${this.getCustomId(state)}//MODAL`)
            .addComponents(components)
    }

    /**
     * @param {import("../CommandHandler").CommandHandlerInteraction} interaction
     * @param {ExchangeHandlerState} state
     */
    async getInitialState(interaction, state) {}

    /**
     * @param {RecallExchangeInteraction} interaction
     * @param {EmbedBuilder} embed
     * @returns {MessageOptionsBuilder}
     */
    async getModalResponse(interaction, embed) {
        return new MessageOptionsBuilder().addEmbeds(embed)
    }

    /**
     * @param {RecallExchangeInteraction} interaction
     * @returns {Promise<MessageOptionsBuilder>}
     */
    async getFinishResponse(interaction) {
        return new MessageOptionsBuilder().setContent(`*${this.title} Process Completed*`).setEphemeral(true)
    }

    /**
     * @param {RecallExchangeInteraction} interaction
     * @returns {Promise<MessageOptionsBuilder>}
     */
    async getCancelResponse(interaction) {
        return new MessageOptionsBuilder().setContent(`*${this.title} Process Cancelled*`).setEphemeral(true)
    }

    /**
     * @param {RecallExchangeInteraction} interaction
     */
    async _getModalResponse(interaction) {
        if (interaction.state.index < 0) return this.getCancelResponse(interaction)

        const action = interaction.args.shift()
        if (action === "MODAL" || (!action && interaction.state.hasState())) {
            const embed = new EmbedBuilder()
                .setFooter({ text: `${this.title}  •  ${interaction.state.index + 1}/${this.length}` })
                .setFields(interaction.state.getEmbedFields(true))
            return this.getModalResponse(interaction, embed)
        }

        const modal = this.getModal(interaction.state)
        if (!modal && !interaction.state.disableNext()) {
            await interaction.update(new MessageOptionsBuilder().setContent("Submitting..."))
            await this.verify(interaction)
            const response = await this.getFinishResponse(interaction)
            return { ...response, last: true }
        }
        return modal
    }
}
