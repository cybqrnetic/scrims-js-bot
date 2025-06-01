import {
    ActionRowBuilder,
    BaseInteraction,
    BaseMessageOptions,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    ContainerBuilder,
    MessageComponentInteraction,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    SeparatorSpacingSize,
} from "discord.js"
import { I18n, LocalizedError, MessageOptionsBuilder, UserError } from "lib"

import { Emojis } from "@Constants"
import { AbstractExchangeHandler, ExchangeState } from "./exchange"
import { FormComponent } from "./input"

interface FormPage {
    components: FormComponent[]
    modal: boolean
}

const Actions = {
    Submit: "SUBMIT",
    Edit: "EDIT",
    Cancel: "CANCEL",
    Component: "COMPONENT",
}

export abstract class AbstractFormHandler extends AbstractExchangeHandler {
    protected readonly title: string
    protected readonly color?: number
    protected readonly description?: string
    protected readonly pages: FormPage[]

    constructor(
        customId: string,
        title: string,
        pages: FormComponent[][],
        description?: string,
        color?: number,
    ) {
        super(customId)
        this.title = title
        this.color = color
        this.description = description
        this.pages = pages.map((components) => ({
            components,
            modal: components.some((v) => v.addModalComponent),
        }))
    }

    protected abstract onInit(ctx: BaseInteraction<"cached">, state: ExchangeState): unknown
    protected abstract onVerify(ctx: BaseInteraction<"cached">): unknown
    protected abstract onFinish(
        interaction: MessageComponentInteraction<"cached">,
        state: ExchangeState,
    ): Promise<BaseMessageOptions>

    protected getIndex(interaction: BaseInteraction<"cached">) {
        return Math.min(parseInt(interaction.args.shift()!), this.pages.length - 1)
    }

    /** @override */
    protected async handleModal(interaction: ModalSubmitInteraction<"cached">) {
        const index = this.getIndex(interaction)
        const page = this.pages[index]!

        if (interaction.message?.flags.has(MessageFlags.Ephemeral)) {
            interaction.response = interaction.update(
                interaction.message?.flags.has(MessageFlags.IsComponentsV2)
                    ? new MessageOptionsBuilder().setContainerContent("Updating...").setEphemeral(true)
                    : new MessageOptionsBuilder().setContent("Updating...").setEphemeral(true),
            )
        } else {
            interaction.response = interaction.deferReply({ flags: MessageFlags.Ephemeral })
        }

        const response = await this.useState(interaction, async (state) => {
            await Promise.all(page.components.map((component) => component.handleModal?.(interaction, state)))
            return this.buildMessage(interaction, state, index)
        })

        await interaction.return(response)
    }

    /** @override */
    protected async handleComponent(interaction: MessageComponentInteraction<"cached">) {
        const action = interaction.args.shift()!
        switch (action) {
            case Actions.Edit:
                return this.handleEdit(interaction)
            case Actions.Cancel:
                return this.handleCancel(interaction)
            case Actions.Submit:
                return this.handleSubmit(interaction)
            case Actions.Component:
                return this.handleSubComponent(interaction)
            default:
                return this.start(interaction)
        }
    }

    protected async handleSubComponent(interaction: MessageComponentInteraction<"cached">) {
        const page = this.getIndex(interaction)
        const index = parseInt(interaction.args.shift()!)
        const component = this.pages[page]?.components[index]
        interaction.response = interaction.deferUpdate()

        const response = await this.useState(interaction, async (state) => {
            await component?.handleComponent?.(interaction, state)
            return this.buildMessage(interaction, state, page)
        })

        await interaction.return(response)
    }

    protected async handleEdit(interaction: MessageComponentInteraction<"cached">) {
        const index = this.getIndex(interaction)
        if (this.pages[index]?.modal) {
            const modal = await this.useState(interaction, (state) =>
                this.buildModal(interaction, state, index),
            )
            await interaction.showModal(modal)
        } else {
            interaction.response = interaction.deferUpdate()
            const response = await this.useState(interaction, (state) =>
                this.buildModal(interaction, state, index),
            )
            await interaction.return(response)
        }
    }

    async start(interaction: MessageComponentInteraction<"cached"> | CommandInteraction<"cached">) {
        await this.onVerify(interaction)

        const response = await this.useState(interaction, async (state) => {
            await this.onInit(interaction, state)
            const page = this.pages[0]!
            if (!page.modal || this.isSubmittable(page, state)) {
                return this.buildMessage(interaction, state, 0)
            }

            return this.buildModal(interaction, state, 0)
        })

        await interaction.return(response)
    }

    protected async handleCancel(interaction: MessageComponentInteraction<"cached">) {
        this.removeState(interaction.args.shift()!)
        await interaction.update(new UserError("Cancelled.").toMessage())
    }

    protected async handleSubmit(interaction: MessageComponentInteraction<"cached">) {
        const index = this.getIndex(interaction)
        interaction.response = interaction.deferUpdate()

        const response = await this.useState(interaction, async (state) => {
            if (index !== this.pages.length - 1) {
                return this.buildMessage(interaction, state, index)
            }

            try {
                await this.onVerify(interaction)
                const resp = await this.onFinish(interaction, state)
                this.removeState(state.getId()!)
                return resp
            } catch (error) {
                let followUp: MessageOptionsBuilder
                if (error instanceof UserError) {
                    followUp = error.toMessage()
                } else if (error instanceof LocalizedError) {
                    followUp = error.toMessage(interaction.i18n)
                } else {
                    followUp = new UserError("Something went wrong while submitting your form.").toMessage()
                }

                interaction.followUp(followUp.setEphemeral(true)).catch(console.error)
            }
        })

        if (response) {
            await interaction.return(response)
        }
    }

    protected buildModal(ctx: BaseInteraction<"cached">, state: ExchangeState, index: number) {
        const modal = new ModalBuilder()
            .setCustomId(`${this.customId}/${index}/${state.getId()}`)
            .setTitle(this.title)

        for (const component of this.pages[index]!.components) {
            component.addModalComponent?.(ctx, state, modal)
        }

        return modal
    }

    getResults(ctx: BaseInteraction<"cached">, state: ExchangeState) {
        return this.pages.flatMap((page) =>
            page.components.map((component) => component.getResult(ctx, state)),
        )
    }

    protected buildMessage(ctx: BaseInteraction<"cached">, state: ExchangeState, index: number) {
        const container = new ContainerBuilder()
        container.setAccentColor(this.color)
        container.addTextDisplayComponents((text) => text.setContent(`# ${this.title}`))
        if (this.description) {
            container.addTextDisplayComponents((text) => text.setContent(this.description!))
        }
        container.addSeparatorComponents((separator) =>
            separator.setDivider(false).setSpacing(SeparatorSpacingSize.Small),
        )

        for (const page of this.pages.slice(0, index + 1)) {
            for (let i = 0; i < page.components.length; i++) {
                const componentId = `${this.customId}/${Actions.Component}/${index}/${i}/${state.getId()}`
                page.components[i]!.addMessageComponents?.(ctx, state, container, componentId)
            }
        }

        if (this.pages.length > 1) {
            container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Large))
            container.addTextDisplayComponents((text) =>
                text.setContent(`${this.title} ${index + 1}/${this.pages.length}`),
            )
        }

        container.addSeparatorComponents((separator) =>
            separator.setDivider(false).setSpacing(SeparatorSpacingSize.Small),
        )
        container.addActionRowComponents(this.buildActions(ctx.i18n, state, index))
        return new MessageOptionsBuilder().setContainer(container).setEphemeral(true)
    }

    protected isSubmittable(page: FormPage, state: ExchangeState) {
        return page.components.every((component) => component.isSubmittable(state))
    }

    protected buildActions(i18n: I18n, state: ExchangeState, index: number) {
        const buttons = new ActionRowBuilder<ButtonBuilder>()
        if (index === this.pages.length - 1) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setEmoji(Emojis.incoming_envelope)
                    .setStyle(ButtonStyle.Success)
                    .setLabel("Submit")
                    .setCustomId(`${this.customId}/${Actions.Submit}/${index}/${state.getId()}`)
                    .setDisabled(!this.pages.every((p) => this.isSubmittable(p, state))),
            )
        } else {
            buttons.addComponents(
                new ButtonBuilder()
                    .setStyle(ButtonStyle.Success)
                    .setLabel("Next")
                    .setCustomId(`${this.customId}/${Actions.Edit}/${index + 1}/${state.getId()}`),
            )
        }

        if (this.pages[index]?.modal) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setEmoji(Emojis.pen_ballpoint)
                    .setStyle(ButtonStyle.Primary)
                    .setLabel("Edit")
                    .setCustomId(`${this.customId}/${Actions.Edit}/${index}/${state.getId()}`),
            )
        }

        if (this.pages.length > 1) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel("Previous")
                    .setCustomId(`${this.customId}/${Actions.Edit}/${index - 1}/${state.getId()}`)
                    .setDisabled(index === 0),
            )
        }

        buttons.addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Danger)
                .setLabel("Cancel")
                .setCustomId(`${this.customId}/${Actions.Cancel}/${state.getId()}`),
        )

        return buttons
    }
}
