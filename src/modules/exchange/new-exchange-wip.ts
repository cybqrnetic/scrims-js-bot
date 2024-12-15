import {
    ActionRowBuilder,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    codeBlock,
    type APIEmbedField,
    type MessageComponentInteraction,
    type ModalSubmitInteraction,
    type TextInputComponentData,
} from "discord.js"

import { MessageOptionsBuilder, Mutex, UserError } from "lib"

class ParseProblem {
    constructor(
        public readonly title: string,
        public readonly description: string,
    ) {}
}

interface Parser<V> {
    parse(ctx: ModalSubmitInteraction, inputted: string): Promise<V | ParseProblem>
    stringify(parsed: V, inputted: string): string
    recall(
        ctx: MessageComponentInteraction | ModalSubmitInteraction,
        stringified: string,
    ): Promise<V | ParseProblem>
}

interface Input<V> {
    parser: Parser<V>
    component: TextInputComponentData
    index: number
}

interface FormPage {
    inputs: Record<string, Input<unknown>>
    index: number
}

interface State {
    index: number
    values: Record<string, { value: string; parsed: unknown | ParseProblem }>
    lock: Mutex
}

const Actions = {
    Submit: "SUBMIT",
    Edit: "EDIT",
    Page: "PAGE",
    Cancel: "CANCEL",
}

class FormExchange {
    protected readonly title!: string
    protected readonly notes!: string
    protected readonly pages: Record<string, FormPage> = {}
    protected readonly states: Map<string, State> = new Map()

    getState(userId: string): State {
        const state = this.states.get(userId)
        if (state !== undefined) return state

        const newState = { index: 0, values: {}, parsed: {}, lock: new Mutex() }
        this.states.set(userId, newState)
        return newState
    }

    protected async handleModal(interaction: ModalSubmitInteraction) {
        const state = this.getState(interaction.user.id)
        const id = parseInt(interaction.args.shift()!)

        const components = interaction.components.flatMap((v) => v.components)
        const page = Object.values(this.pages)[id]
        if (!page) throw new UserError("Invalid Interaction")

        if (page.index !== state.index) {
            await this.recall(state, page.index, interaction)
        }

        for (const component of components) {
            const input = page.inputs[component.customId]
            if (input) {
                const parsed = await input.parser.parse(interaction, component.value)
                state.values[component.customId] = { value: component.value, parsed }
            }
        }
    }

    protected async handleComponent(interaction: MessageComponentInteraction) {
        const action = interaction.args.shift()!
        switch (action) {
            case Actions.Page:
                return this.handlePage(interaction)
            case Actions.Edit:
                return this.handleEdit(interaction)
            case Actions.Cancel:
                return this.handleCancel(interaction)
            case Actions.Submit:
                return this.handleSubmit(interaction)
        }
    }

    protected async handlePage(interaction: MessageComponentInteraction) {
        const id = interaction.args.shift()!
        const page = this.pages[id]
        if (!page) throw new UserError("Invalid State")
        await this.showPage(interaction, page)
    }

    protected async handleEdit(interaction: MessageComponentInteraction) {
        const state = this.getState(interaction.user.id)
        const id = parseInt(interaction.args.shift()!)
        const page = Object.values(this.pages)[id]
        if (!page) throw new UserError("Invalid State")

        if (Object.keys(state.values).length === 0) {
            await this.recall(state, id, interaction)
        }

        await this.showPage(interaction, page)
    }

    protected async handleCancel(interaction: MessageComponentInteraction) {
        this.states.delete(interaction.user.id)
        await interaction.update(new MessageOptionsBuilder().setContent("Cancelled."))
    }

    protected async handleSubmit(interaction: MessageComponentInteraction) {
        const state = this.getState(interaction.user.id)
        if (Object.keys(state.values).length === 0) {
            await this.recall(state, Object.keys(this.pages).length - 1, interaction)
        }

        await interaction.update(new MessageOptionsBuilder().setContent("Submitted."))
    }

    protected async showPage(interaction: MessageComponentInteraction, page: FormPage) {
        return interaction.showModal(
            new ModalBuilder()
                .setTitle(this.title)
                .addComponents(
                    Object.values(page.inputs).map(
                        (v) => new ActionRowBuilder<TextInputBuilder>(v.component),
                    ),
                ),
        )
    }

    protected async recall(
        state: State,
        idx: number,
        interaction: MessageComponentInteraction | ModalSubmitInteraction,
    ) {
        const fields = new Map<string, string>()
        for (const embed of interaction.message?.embeds ?? []) {
            for (const field of embed.fields) {
                fields.set(field.name, field.value)
            }
        }

        for (const pvPage of Object.values(this.pages).slice(0, idx + 1)) {
            for (const input of Object.values(pvPage.inputs)) {
                const value = fields.get(input.component.label)
                if (value === undefined) throw new UserError("Invalid State")
                const parsed = await input.parser.recall(interaction, value)
                state.values[input.component.customId] = { value, parsed }
            }
        }
    }

    protected getResponse(state: State) {
        const embeds: EmbedBuilder[] = [new EmbedBuilder()]
        let embed: EmbedBuilder = embeds[0]!

        for (const page of Object.values(this.pages)) {
            for (const input of Object.values(page.inputs)) {
                const { value, parsed } = state.values[input.component.customId]!
                const adding: APIEmbedField[] = []
                if (parsed instanceof ParseProblem) {
                    adding.push({ name: input.component.label, value: codeBlock(value) })
                    adding.push({ name: parsed.title, value: parsed.description })
                } else {
                    const stringified = input.parser.stringify(parsed, value)
                    adding.push({ name: input.component.label, value: codeBlock(stringified) })
                }

                if ((embed.data.fields?.length ?? 0) + adding.length > 25) {
                    embed = new EmbedBuilder()
                    embeds.push(embed)
                }
                embed.addFields(...adding)
            }
        }

        embeds[0]!.setTitle(this.title).setDescription(this.notes)

        const footer = `Form ${state.index + 1}/${Object.keys(this.pages).length}`
        embeds[embeds.length - 1]!.setFooter({ text: footer })

        if (state.index === Object.keys(state.values).length - 1) {
        }
    }
}
