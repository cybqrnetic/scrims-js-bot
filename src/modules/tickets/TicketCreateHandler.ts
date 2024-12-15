import {
    EmbedBuilder,
    GuildChannelCreateOptions,
    GuildMember,
    TextChannel,
    type Interaction,
} from "discord.js"
import { MessageOptionsBuilder } from "lib"

import { ExchangeHandler, ExchangeInputField, RecallExchangeInteraction } from "../exchange"
import { Ticket } from "./Ticket"
import { TicketManager } from "./TicketManager"

export class TicketCreateHandler extends ExchangeHandler {
    constructor(
        customId: string,
        title: string,
        readonly tickets: TicketManager,
        fields: ExchangeInputField<any>[],
    ) {
        super(customId, title, fields)
    }

    /** @override */
    async verify(interaction: Interaction) {
        await this.tickets.verifyTicketRequest(interaction.user, interaction.guildId!)
        return true
    }

    /** @overload */
    getModalResponse(interaction: RecallExchangeInteraction, embed: EmbedBuilder) {
        return new MessageOptionsBuilder().addEmbeds(
            embed.setTitle("Ticket Create Confirmation").setColor("#FFFFFF"),
        )
    }

    async getTicketExtras(interaction: RecallExchangeInteraction): Promise<object | void> {}

    /** @overload */
    async getFinishResponse(interaction: RecallExchangeInteraction) {
        const messages = await this.buildTicketMessages(interaction)

        let ticket: Ticket | undefined
        const channel = await this.createTicketChannel(interaction)
        try {
            ticket = await Ticket.create({
                channelId: channel.id,
                guildId: interaction.guildId!,
                userId: interaction.user.id,
                type: this.tickets.type,
                extras: await this.getTicketExtras(interaction),
            })
            await Promise.all(messages.map((m) => channel.send(m)))
            this.onCreate(ticket!, channel, interaction).catch(console.error)
            return new MessageOptionsBuilder().setContent(`${channel}`)
        } catch (error) {
            await Promise.all([
                channel.delete().catch(console.error),
                ticket?.deleteOne().catch(console.error),
            ])
            throw error
        }
    }

    async buildTicketMessages(interaction: RecallExchangeInteraction) {
        return [
            new MessageOptionsBuilder().addEmbeds(
                new EmbedBuilder()
                    .setDescription(
                        `👋 **Welcome** ${interaction.user} to your ${this.tickets.type} ticket channel.`,
                    )
                    .setFields(interaction.state.getEmbedFields())
                    .setTitle("Ticket Channel")
                    .setColor("#FFFFFF"),
            ),
        ]
    }

    async onCreate(ticket: Ticket, channel: TextChannel, interaction: RecallExchangeInteraction) {}

    async createTicketChannel(
        interaction: RecallExchangeInteraction,
        channelOptions: Partial<GuildChannelCreateOptions> = {},
    ) {
        if (!channelOptions.name)
            channelOptions.name = `${this.tickets.type.toLowerCase()}-${interaction.user.username}`
        return this.tickets.createChannel(interaction.member as GuildMember, channelOptions)
    }
}
