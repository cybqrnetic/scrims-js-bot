import { Message, MessageReaction, PartialMessage, PartialMessageReaction } from "discord.js"
import { SequencedAsyncExecutor } from "lib"

import { Config } from "@module/config"
import { Suggestion } from "./Suggestion"
import { ConfigKeys, MessageRating, SuggestionsModule } from "./module"

const sync = new SequencedAsyncExecutor({ merge: true, cooldown: 3000 })
export default async function (
    suggestions: SuggestionsModule,
    reaction: MessageReaction | PartialMessageReaction,
) {
    return sync.submit(reaction.message.channelId, () => onReactionUpdate(suggestions, reaction))
}

async function onReactionUpdate(
    suggestions: SuggestionsModule,
    reaction: MessageReaction | PartialMessageReaction,
) {
    const voteConst = suggestions.getVoteConst(reaction.message.guildId!)
    if (!voteConst) return

    const suggestion = await suggestions.findSuggestionByMessage(reaction.message.id)
    if (!suggestion?.title) return

    const rating = suggestions.getMessageRating(reaction.message)
    const { upVotes, downVotes } = rating

    if (downVotes / upVotes > voteConst) return onUnpopularSuggestion(reaction.message, suggestion)
    if (upVotes / downVotes > voteConst) return onPopularSuggestion(reaction.message, suggestion, rating)

    const ratio = upVotes >= downVotes ? upVotes / downVotes : -(downVotes / upVotes)
    await reaction.message.edit({
        embeds: [suggestion.toEmbed(ratio * (60 / voteConst) + 60)],
    })
}

async function onUnpopularSuggestion(message: Message | PartialMessage, suggestion: Suggestion) {
    if (suggestion.epic) {
        await message.edit({ embeds: [suggestion.toEmbed(0)] })
        return
    }

    await message.delete()
    await suggestion.deleteOne()
}

async function onPopularSuggestion(
    message: Message | PartialMessage,
    suggestion: Suggestion,
    rating: MessageRating,
) {
    const embed = suggestion.toEmbed(-1)
    await message.edit({ embeds: [embed] }).catch(console.debugError)

    if (!suggestion.epic && message.guild) {
        await Suggestion.updateOne({ _id: suggestion._id }, { epic: Date.now() })
        suggestion.epic = new Date()

        const channelId = Config.getConfigValue(ConfigKeys.EpicChannel, message.guildId!)
        if (channelId) {
            const channel = await message.guild.channels.fetch(channelId).catch(() => null)
            if (channel?.isTextBased()) {
                embed.setFooter({ text: "Created at" }).setTimestamp(suggestion.createdAt)
                await Promise.all([channel.send({ embeds: [embed] }), channel.send({ content: `${rating}` })])
            }
        }
    }
}
