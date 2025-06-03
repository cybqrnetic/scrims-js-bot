import {
    BaseInteraction,
    ButtonStyle,
    codeBlock,
    EmbedBuilder,
    GuildChannelCreateOptions,
    GuildMember,
    MessageComponentInteraction,
    TextChannel,
    TextInputStyle,
} from "discord.js"
import { I18n, LocalizedError, MessageOptionsBuilder, TextUtil, TimeUtil } from "lib"

import { Config } from "@module/config"
import { ExchangeState, IgnInput, TextInput } from "@module/forms"
import { BotMessage } from "@module/messages"
import { PositionRole } from "@module/positions"
import { Ticket, TicketCreateHandler, TicketManager } from "@module/tickets"
import { Vouch } from "@module/vouch-system"
import { VouchCollection } from "@module/vouch-system/VouchCollection"
import { CouncilVoteManager } from "./CouncilVoteManager"

export interface RankAppExtras {
    votes: Record<string, number>
}

function CreateRankApplications(rank: string, cooldown: number) {
    const tickets = new RankAppTicketManager(rank, cooldown)
    const handler = new RankAppCreateHandler(rank, tickets)

    const componentId = handler.register().getId()
    BotMessage({
        name: `${rank} Applications`,
        permission: `council.${rank.toLowerCase()}.manageApp`,
        builder(i18n, member) {
            const minVouches = handler.minVouches(member.guild.id)
            const council = PositionRole.getRoles(`${rank} Council`, member.guild.id)[0] ?? `@${rank} Council`
            return new MessageOptionsBuilder()
                .addEmbeds((embed) =>
                    embed
                        .setTitle(`${rank} Applications`)
                        .setColor(member.guild.members.me?.displayColor ?? null)
                        .setDescription(
                            `If you have gained at least ${minVouches} vouches from dueling the ` +
                                `${council} you can apply for ${rank} with the button below.`,
                        ),
                )
                .addButtons((button) =>
                    button
                        .setLabel(`Apply for ${rank}`)
                        .setStyle(ButtonStyle.Primary)
                        .setCustomId(componentId),
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
            permission: `council.${rank.toLowerCase()}.manageApp`,
        })

        this.vote = new CouncilVoteManager(rank)
    }

    /** @override */
    async createChannel(member: GuildMember, channelOptions: Partial<GuildChannelCreateOptions> = {}) {
        if (!channelOptions.name) channelOptions.name = `app-${member.user.username}`
        return super.createChannel(member, channelOptions)
    }
}

const IGN_INPUT = IgnInput.builder().setId("ign").setLabel("Minecraft Username").setRequired(true).build()
const COMMENTS_INPUT = TextInput.builder()
    .setId("comments")
    .setLabel("Any additional reasons why to accept?")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1500)
    .build()

function getNotes(tickets: TicketManager) {
    return (
        `:mag:   Please **verify all fields** are filled out as intended before you 📨 **Submit** this.` +
        (tickets.options.cooldown
            ? `\n:hourglass_flowing_sand:   Note that the **application cooldown** is ` +
              `${TextUtil.stringifyTimeDelta(tickets.options.cooldown)}.`
            : "")
    )
}

class RankAppCreateHandler extends TicketCreateHandler {
    readonly GuildConfig

    constructor(
        readonly rank: string,
        tickets: TicketManager,
    ) {
        super(
            `${rank}Application`,
            `${rank} Application`,
            tickets,
            [[IGN_INPUT, COMMENTS_INPUT]],
            getNotes(tickets),
            0xbbddf5,
        )
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
    async onVerify(ctx: BaseInteraction<"cached">) {
        await super.onVerify(ctx)

        const vouches = await VouchCollection.fetch(ctx.user.id, this.rank)
        const minVouches = this.minVouches(ctx.guildId)
        if (vouches.getPositive().length < minVouches) {
            throw new LocalizedError("app_not_enough_vouches", {
                title: [minVouches, this.rank],
                description: [
                    Config.getConfigValue(this.GuildConfig.InfoChannel, ctx.guildId),
                    Config.getConfigValue("Support Channel", ctx.guildId),
                ],
                footer: [TimeUtil.stringifyTimeDelta(Vouch.getExpiration(this.rank))],
            })
        }
    }

    /** @override */
    async buildTicketMessages(interaction: MessageComponentInteraction<"cached">, state: ExchangeState) {
        const color = PositionRole.getRoles(this.rank, interaction.guildId)[0]?.hexColor ?? null
        const vouches = await VouchCollection.fetch(interaction.user.id, this.rank)

        return [
            new MessageOptionsBuilder().addEmbeds(
                new EmbedBuilder()
                    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                    .setTitle(this.title)
                    .setFields(
                        this.getResults(interaction, state).map((v) => ({
                            name: v.label,
                            value: v.value ?? codeBlock(""),
                        })),
                    )
                    .setColor(color),
            ),

            vouches.toMessage(
                I18n.getInstance(),
                {
                    includeHidden: true,
                    includeExpired: true,
                },
                interaction.guildId,
            ),

            this.vote.buildVoteMessage(interaction.user, interaction.guild),
        ]
    }

    /** @override */
    protected onCreate(_ctx: BaseInteraction<"cached">, _ticket: Ticket, _channel: TextChannel) {
        return Promise.resolve(
            new MessageOptionsBuilder().setContent(
                `Your application was received! You will be informed through DMs once a decision is made.`,
            ),
        )
    }
}

CreateRankApplications("Prime", 0)
CreateRankApplications("Private", 30 * 24 * 60 * 60)
CreateRankApplications("Premium", 30 * 24 * 60 * 60)
