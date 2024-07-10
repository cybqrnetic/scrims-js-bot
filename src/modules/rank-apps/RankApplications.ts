import { EmbedBuilder, GuildChannelCreateOptions, GuildMember, TextInputStyle } from "discord.js"
import {
    BotMessage,
    CommandHandlerInteraction,
    Component,
    Config,
    I18n,
    LocalizedError,
    MessageOptionsBuilder,
    PositionRole,
    TextUtil,
    TimeUtil,
} from "lib"

import { Positions } from "@Constants"
import { ButtonStyle } from "discord.js"
import { ExchangeInputField, RecallExchangeInteraction } from "../exchange"
import { TicketCreateHandler, TicketManager } from "../tickets"
import { VouchCollection } from "../vouch-system/VouchCollection"
import { CouncilVoteManager } from "./CouncilVoteManager"

export interface RankAppExtras {
    votes: Record<string, number>
}

function CreateRankApplications(rank: string, cooldown: number) {
    const tickets = new RankAppTicketManager(rank, cooldown)
    const handler = new RankAppCreateHandler(rank, tickets)

    Component(handler.asComponent())
    BotMessage({
        name: `${rank} Applications`,
        builder(builder, member) {
            const minVouches = handler.minVouches(member.guild.id)
            return builder
                .addEmbeds((embed) =>
                    embed
                        .setTitle(`${rank} Applications`)
                        .setColor(member.guild.members.me?.displayColor ?? null)
                        .setDescription(
                            `If you have gained at least ${minVouches} vouches from dueling the ` +
                                (PositionRole.getRoles(`${rank} Council`, member.guild.id)[0]?.toString() ??
                                    `@${rank} Council`) +
                                ` you can apply for ${rank} with the button below.`,
                        ),
                )
                .addButtons((button) =>
                    button
                        .setLabel(`Apply for ${rank}`)
                        .setStyle(ButtonStyle.Primary)
                        .setCustomId(handler.customId),
                )
        },
    })
}

export class RankAppTicketManager extends TicketManager {
    readonly vote

    constructor(
        readonly rank: string,
        cooldown: number,
    ) {
        super(`${rank} App`, {
            commonCloseReasons: ["User Denied", "User Accepted", "Joke Application"],
            transcript: { dmUsers: false },
            creatorPermissions: [],
            closeIfLeave: false,
            cooldown,
            permissions: {
                positionLevel: Positions.Staff,
                positions: [`${rank} Head`],
            },
        })

        this.vote = new CouncilVoteManager(rank)
    }

    /** @override */
    async createChannel(member: GuildMember, channelOptions: Partial<GuildChannelCreateOptions> = {}) {
        if (!channelOptions.name) channelOptions.name = `app-${member.user.username}`
        return super.createChannel(member, channelOptions)
    }
}

const APPLICATION_FIELDS = [
    ExchangeInputField("McAccount", {
        customId: "mc_account",
        label: "What is your Minecraft IGN?",
        style: TextInputStyle.Short,
        minLength: 3,
        maxLength: 16,
        required: true,
    }),

    ExchangeInputField({
        customId: "comments",
        label: "Any additional reasons why to accept?",
        style: TextInputStyle.Paragraph,
        maxLength: 1500,
        required: false,
    }),
]

class RankAppCreateHandler extends TicketCreateHandler {
    readonly GuildConfig

    constructor(
        readonly rank: string,
        tickets: TicketManager,
    ) {
        super(`${rank}Application`, `${rank} Application`, tickets, APPLICATION_FIELDS)
        this.GuildConfig = Config.declareTypes({
            MinVouches: `${rank} App Min Vouches`,
            InfoChannel: `${rank} Info Channel`,
        })
    }

    get vote() {
        return (this.tickets as RankAppTicketManager).vote
    }

    minVouches(guildId: string) {
        return parseInt(Config.getConfigValue(this.GuildConfig.MinVouches, guildId, "2")) || 2
    }

    /** @override */
    async verify(interaction: CommandHandlerInteraction) {
        await super.verify(interaction)
        const vouches = await VouchCollection.fetch(interaction.user.id, this.rank)
        const minVouches = this.minVouches(interaction.guildId!)
        if (vouches.getPositive().length < minVouches)
            throw new LocalizedError("app_not_enough_vouches", {
                title: [minVouches, this.rank],
                description: [
                    interaction.client.getConfigValue(this.GuildConfig.InfoChannel, interaction.guildId!),
                    interaction.client.getConfigValue("Support Channel", interaction.guildId!),
                ],
                footer: [TimeUtil.stringifyTimeDelta(Vouch.getExpiration(this.rank))],
            })

        return true
    }

    /** @override */
    async buildTicketMessages(interaction: RecallExchangeInteraction) {
        const color = PositionRole.getRoles(this.rank, interaction.guildId!)[0]?.hexColor ?? null
        const vouches = await VouchCollection.fetch(interaction.user.id, this.rank)

        return [
            new MessageOptionsBuilder().addEmbeds(
                new EmbedBuilder()
                    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                    .setTitle(this.title)
                    .setFields(interaction.state.getEmbedFields())
                    .setColor(color),
            ),

            vouches.toMessage(
                I18n.getInstance(),
                {
                    includeHidden: true,
                    includeExpired: true,
                },
                interaction.guildId!,
            ),

            this.vote.buildVoteMessage(interaction.user, interaction.guild!),
        ]
    }

    /** @override */
    getModalResponse(interaction: RecallExchangeInteraction, embed: EmbedBuilder) {
        if (interaction.state.index === -1) return super.getModalResponse(interaction, embed)
        embed.setTitle(`${this.rank} Application Confirmation`)
        embed.setDescription(
            `:mag:   Please **verify all fields** are filled out as intended before you 📨 **Submit** this.` +
                (this.tickets.options.cooldown
                    ? `\n:hourglass_flowing_sand:   Note that the **application cooldown** is ` +
                      `${TextUtil.stringifyTimeDelta(this.tickets.options.cooldown)}.`
                    : ""),
        )
        embed.setColor("#BBDDF5")
        return new MessageOptionsBuilder().addEmbeds(embed)
    }

    /** @override */
    async getFinishResponse(interaction: RecallExchangeInteraction) {
        await super.getFinishResponse(interaction)
        return new MessageOptionsBuilder().setContent(
            `Your application was received! You will be informed through DMs once a decision is made.`,
        )
    }
}

CreateRankApplications("Prime", 0)
CreateRankApplications("Private", 30 * 24 * 60 * 60)
CreateRankApplications("Premium", 30 * 24 * 60 * 60)
