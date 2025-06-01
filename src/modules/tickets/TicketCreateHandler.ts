import {
    BaseInteraction,
    GuildChannelCreateOptions,
    MessageComponentInteraction,
    TextChannel,
} from "discord.js"
import { MessageOptionsBuilder } from "lib"

import { AbstractFormHandler, ExchangeState, FormComponent } from "@module/forms"
import { Ticket } from "./Ticket"
import { TicketManager } from "./TicketManager"

export abstract class TicketCreateHandler extends AbstractFormHandler {
    constructor(
        customId: string,
        title: string,
        readonly tickets: TicketManager,
        pages: FormComponent[][],
        notes?: string,
        color?: number,
    ) {
        super(customId, title, pages, notes, color)
    }

    /** @override */
    protected onInit() {}

    /** @override */
    protected async onVerify(ctx: BaseInteraction<"cached">) {
        await this.tickets.verifyTicketRequest(ctx.user, ctx.guildId)
    }

    /** @override */
    protected async onFinish(interaction: MessageComponentInteraction<"cached">, state: ExchangeState) {
        const messages = await this.buildTicketMessages(interaction, state)

        let ticket: Ticket | undefined
        const channel = await this.createTicketChannel(interaction)
        try {
            ticket = await Ticket.create({
                channelId: channel.id,
                guildId: interaction.guildId,
                userId: interaction.user.id,
                type: this.tickets.type,
                extras: await this.getTicketExtras(interaction),
            })
            await Promise.all(messages.map((m) => channel.send(m)))
            return this.onCreate(interaction, ticket, channel)
        } catch (error) {
            await Promise.all([
                channel.delete().catch(console.error),
                ticket?.deleteOne().catch(console.error),
            ])
            throw error
        }
    }

    protected abstract buildTicketMessages(
        interaction: MessageComponentInteraction<"cached">,
        state: ExchangeState,
    ): Promise<MessageOptionsBuilder[]>

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async getTicketExtras(ctx: BaseInteraction<"cached">): Promise<object | void> {}

    protected async onCreate(ctx: BaseInteraction<"cached">, ticket: Ticket, channel: TextChannel) {
        return Promise.resolve(
            new MessageOptionsBuilder().setContainerContent(`### Your Ticket Channel: ${channel}`),
        )
    }

    protected async createTicketChannel(
        ctx: BaseInteraction<"cached">,
        channelOptions: Partial<GuildChannelCreateOptions> = {},
    ) {
        if (!channelOptions.name)
            channelOptions.name = `${this.tickets.type.toLowerCase()}-${ctx.user.username}`
        return this.tickets.createChannel(ctx.member, channelOptions)
    }
}
