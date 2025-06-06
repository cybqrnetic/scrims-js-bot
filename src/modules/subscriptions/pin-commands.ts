import { MAIN_GUILD_ID } from "@Constants"
import { Config } from "@module/config"
import { membersFetched } from "@module/member-fetcher"
import { HostPermissions } from "@module/permissions"
import { Events, InteractionContextType, SlashCommandBuilder } from "discord.js"
import { bot, BotListener, DB, SlashCommand, UserError } from "lib"
import { SubscriptionFeaturePermissions } from "."
import { PinnedMessage } from "./PinnedMessage"

const INVALID_LINK_ERROR = new UserError("Invalid Message Link", "Please provide a valid message link.")
const MAX_PINNED_MESSAGES = Config.declareType("Max Pinned Messages")

SlashCommand({
    builder: new SlashCommandBuilder()
        .setLocalizations("commands.pin")
        .addStringOption((option) =>
            option.setLocalizations("commands.pin.message_option").setRequired(true),
        ),

    config: { defer: "EphemeralReply", permission: SubscriptionFeaturePermissions.PinMessages },

    async handler(interaction) {
        const pinnedAmount = await PinnedMessage.countDocuments({
            userId: interaction.user.id,
            guildId: interaction.guild.id,
        })

        const maxPinnedAmount = parseInt(
            Config.getConfigValue(MAX_PINNED_MESSAGES, interaction.guild.id, "5"),
        )

        if (pinnedAmount >= maxPinnedAmount) {
            throw new UserError(
                "Max Pinned Messages",
                `You have already pinned ${maxPinnedAmount} messages. Please unpin one before pinning another.`,
            )
        }

        const messageUrl = interaction.options.getString("message-link", true).trim()
        const [channelId, messageId] = messageUrl.split("/").slice(-2)

        if (!channelId || !messageId) throw INVALID_LINK_ERROR

        const channel = await interaction.guild.channels.fetch(channelId)
        if (!channel?.isTextBased()) throw INVALID_LINK_ERROR

        const channelPermissions = channel.permissionsFor(interaction.user)
        if (!channelPermissions?.has("ViewChannel") || !channelPermissions?.has("SendMessages")) {
            throw new UserError(
                "Insufficient Permissions",
                "You do not have permission to view or send messages in this channel.",
            )
        }

        const message = await channel.messages.fetch(messageId).catch(() => null)
        if (!message) throw INVALID_LINK_ERROR

        if (message.pinned) {
            throw new UserError("Already Pinned", "This message is already pinned.")
        }

        await message.pin()
        await PinnedMessage.create({
            _id: message.id,
            channelId: channel.id,
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            url: message.url,
            archived: false,
        })

        await interaction.editReply(
            `Successfully pinned ${message.url}! You can unpin it with **\`/unpin.\`**.`,
        )
    },
})

SlashCommand({
    builder: new SlashCommandBuilder()
        .setLocalizations("commands.unpin")
        .addStringOption((option) =>
            option.setLocalizations("commands.unpin.message_option").setRequired(true).setAutocomplete(true),
        )
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions("0"),

    config: { defer: "EphemeralReply", permission: SubscriptionFeaturePermissions.PinMessages },

    async handleAutocomplete(interaction) {
        const userId = interaction.user.id
        const guildId = interaction.guild.id

        const pinnedMessages = await PinnedMessage.find({ userId, guildId })
        const choices = pinnedMessages.map((message) => ({ name: message.url, value: message.url }))

        await interaction.respond(choices)
    },

    async handler(interaction) {
        const messageUrl = interaction.options.getString("message-link", true).trim()
        const messageRecord = await PinnedMessage.findOne({ url: messageUrl, userId: interaction.user.id })

        if (!messageRecord) {
            throw new UserError("Not Pinned", "This message is not pinned by you.")
        }

        const channel = await interaction.guild.channels.fetch(messageRecord.channelId)
        if (channel?.isTextBased()) {
            const message = await channel.messages.fetch(messageRecord._id).catch(() => null)
            await message?.unpin()
        }

        await messageRecord.deleteOne()
        await interaction.editReply(
            `Successfully unpinned ${messageRecord.url}! You can pin it again with **\`/pin.\`**.`,
        )
    },
})

BotListener(Events.MessageDelete, async (_bot, message) => {
    if (message.pinned === false) return
    await PinnedMessage.deleteOne({ _id: message.id })
})

BotListener(Events.MessageBulkDelete, async (_bot, messages) => {
    await PinnedMessage.deleteMany({
        _id: { $in: messages.filter((m) => m.pinned !== false).map((m) => m.id) },
    })
})

BotListener(Events.GuildMemberRemove, async (_bot, member) => {
    if (member.guild.id === MAIN_GUILD_ID) return
    if (!member.hasPermission(SubscriptionFeaturePermissions.PinMessages)) return

    await togglePinnedMessages(member.id, false)
})

HostPermissions.on("update", async (userId, update) => {
    if (update.added(SubscriptionFeaturePermissions.PinMessages)) {
        await togglePinnedMessages(userId, true)
    } else if (update.removed(SubscriptionFeaturePermissions.PinMessages)) {
        await togglePinnedMessages(userId, false)
    }
})

const pinnedMessages = DB.addStartupTask(() => PinnedMessage.find())
void membersFetched().then(() => {
    for (const pinnedMessage of pinnedMessages.value) {
        const guild = bot.guilds.cache.get(pinnedMessage.guildId)
        const member = guild?.members.cache.get(pinnedMessage.userId)
        if (!member?.hasPermission(SubscriptionFeaturePermissions.PinMessages)) {
            togglePinnedMessages(pinnedMessage.userId, false).catch(console.error)
        }
    }
})

async function togglePinnedMessages(userId: string, shouldPin: boolean) {
    const pinnedMessages = await PinnedMessage.find({
        userId: userId,
        archived: shouldPin,
    })

    if (pinnedMessages.length === 0) return

    const successfulIds = new Set<string>()
    const failedIds = new Set<string>()

    await Promise.all(
        pinnedMessages.map(async ({ channelId, _id }) => {
            try {
                const channel = await bot.channels.fetch(channelId)
                if (!channel?.isTextBased()) return failedIds.add(_id)

                const message = await channel.messages.fetch(_id).catch(() => null)
                if (!message || message.pinned === shouldPin) return failedIds.add(_id)

                if (shouldPin) await message.pin()
                else await message.unpin()
                successfulIds.add(_id)
            } catch {
                failedIds.add(_id)
            }
        }),
    )

    if (successfulIds.size > 0) {
        await PinnedMessage.updateMany({ userId, _id: { $in: [...successfulIds] } }, { archived: !shouldPin })
    }

    if (failedIds.size > 0) {
        await PinnedMessage.deleteMany({ userId, _id: { $in: [...failedIds] } })
    }
}
