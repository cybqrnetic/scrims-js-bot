import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    InteractionType,
    Message,
    MessageFlags,
    ModalBuilder,
} from "discord.js"

import { redis } from "../../db"
import { LocalizedError } from "../../utils/LocalizedError"
import { MessageOptionsBuilder } from "../../utils/MessageOptionsBuilder"

/**
 * @template [S=RecallComponentState]
 *
 * @typedef StateManager
 * @property {(i: import("../CommandHandler").CommandHandlerInteraction) => Promise<S>} getInitialState
 * @property {((previousResponse: Message<true>) => S)} recall
 *
 * @typedef Parser
 * @property {((state: S, i: RecallComponentInteraction, data: import('discord.js').ModalData) => Promise)} parseModalComponents
 */

/**
 * @template [S=RecallComponentState]
 */
export class StateComponentHandler {
    /**
     * @param {string} customId
     * @param {*} getResponseCall
     * @param {?StateManager<S>} stateManager
     * @param {?Parser<S>} parser
     */
    constructor(customId, getResponseCall, stateManager = null, parser = null) {
        /** @readonly */
        this.customId = customId

        /**
         * @protected
         * @type {Object<string, S>}
         */
        this.states = {}

        /** @protected */
        this.usages = new Set()

        /** @protected */
        this.parser = parser

        /** @protected*/
        this.stateManager = stateManager

        /** @protected */
        this.getResponseCall = getResponseCall
    }

    getCustomId(state) {
        return `${this.customId}//${state?.index ?? "0"}/${state ? state.id : "/"}`
    }

    /** @protected */
    getNextButton(state, label = "Continue") {
        if (label === false) return false
        return new ButtonBuilder()
            .setLabel(label)
            .setCustomId(`${this.getCustomId(state)}/NEXT`)
            .setStyle(ButtonStyle.Success)
    }

    /** @protected */
    getBackButton(state, label = "Back") {
        if (label === false) return false
        return new ButtonBuilder()
            .setLabel(label)
            .setCustomId(`${this.getCustomId(state)}/BACK`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(state.index === 0)
    }

    /** @protected */
    getCancelButton(state, label = "Cancel") {
        if (label === false) return false
        return new ButtonBuilder()
            .setLabel(label)
            .setCustomId(`${this.getCustomId(state)}/CANCEL`)
            .setStyle(ButtonStyle.Danger)
    }

    /** @protected */
    getButtons(state, response) {
        return [
            this.getNextButton(state, response.nextOption),
            this.getBackButton(state, response.backOption),
            this.getCancelButton(state, response.cancelOption),
        ].filter((v) => v)
    }

    /**
     * @protected
     * @param {RecallComponentInteraction} interaction
     */
    async getResponse(interaction) {
        const response = await this.getResponseCall(interaction)
        if (response instanceof ModalBuilder) return response
        if (!response) return null

        if (!response.last) {
            const buttons = this.getButtons(interaction.state, response)
            if (buttons.length > 0 && interaction.state.index >= 0)
                response.components = [
                    new ActionRowBuilder().addComponents(...buttons),
                    ...(response?.components ?? []),
                ]
            else response.components = response.components ?? []
        }

        return { ...response, ephemeral: true }
    }

    /**
     * @protected
     * @param {import("discord.js").Interaction & import("../CommandHandler").CommandHandlerInteractionData} interaction
     */
    async onInteract(interaction) {
        const [_, index, stateId, action] = Array.from(new Array(4)).map((_) => interaction.args.shift())

        if (this.usages.has(interaction.user.id)) return
        this.usages.add(interaction.user.id)
        try {
            if (interaction.type === InteractionType.ModalSubmit) {
                if (interaction?.message?.flags?.has(MessageFlags.Ephemeral)) {
                    await interaction.update(new MessageOptionsBuilder().setContent("Editing..."))
                } else await interaction.deferReply({ ephemeral: true })
            }

            const state = await this.getState(stateId, interaction)
            if (!state) throw new LocalizedError("recaller_unknown_state")
            state.index = parseInt(index) || 0

            if (action === "NEXT") state.index += 1
            if (action === "BACK") state.index -= 1
            if (action === "CANCEL") state.index = -1

            this.states[state.id] = state
            interaction.state = state

            if (interaction.type === InteractionType.ModalSubmit && this.parser) {
                await this.parser.parseModalComponents(
                    state,
                    interaction,
                    interaction.components.map((v) => v.components).flat(),
                )
            }

            const response = await this.getResponse(interaction)
            await interaction.return(response ?? new MessageOptionsBuilder().setContent("Process Complete!"))

            if (!response || response.last || state.index === -1) {
                delete this.states[state.id]
                if (redis.isOpen) redis.del(`componentState:${state.id}`)
            } else {
                await this.setState(state)
            }
        } finally {
            this.usages.delete(interaction.user.id)
        }
    }

    /** @protected */
    async setState(state) {
        this.states[state.id] = state
        setTimeout(() => delete this.states[state.id], 30 * 60 * 1000)
        if (redis.isOpen) {
            redis.setEx(`componentState:${state.id}`, 30 * 60, JSON.stringify(state)).catch(console.error)
        }
    }

    /** @protected */
    async getState(stateId, interaction) {
        const state = this.states[stateId] ?? null
        if (!state && redis.isOpen)
            return this.stateManager.fromJSON(
                await redis.get(`componentState:${stateId}`).catch(console.error),
            )
        return state
    }

    /**
     * @param {import("../CommandHandler").CommandHandlerInteraction} interaction
     * @returns {unknown}
     */
    async verify(interaction) {}

    /** @param {import("../CommandHandler").CommandHandlerInteraction} interaction */
    async handle(interaction) {
        interaction.handler = this
        if (interaction?.args?.[0] === "") return this.onInteract(interaction)

        await this.verify(interaction)
        const state = this.stateManager ? await this.stateManager.getInitialState(interaction) : {}
        interaction.state = state
        const response = await this.getResponse(interaction)
        if (response) {
            if (state?.id) this.setState(state)
            await interaction.return(response)
        }
    }

    asComponent() {
        return {
            builder: this.customId,
            mixedHandler: async (interaction) => this.handle(interaction),
        }
    }
}

/**
 * @typedef RecallComponentState
 * @prop {string} id
 * @prop {number} index
 *
 * @typedef RecallComponentInteractionData
 * @prop {StateComponentHandler} handler
 * @prop {RecallComponentState} state
 *
 * @typedef {import("../CommandHandler").CommandHandlerInteraction & RecallComponentInteractionData} RecallComponentInteraction
 */
