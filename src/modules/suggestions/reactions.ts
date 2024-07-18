import { Message } from "discord.js"
import { Base, MessageReactionData, SequencedAsync, Suggestion } from "lib"
import { MessageRating, SuggestionsModule } from "./module"

class SuggestionsReactionHandler {
    @SequencedAsync({ cooldown: 5, merge: true })
    async onReactionUpdate(reaction: MessageReactionData<true>) {
        const voteConst = SuggestionsModule.getInstance().getVoteConst(reaction.message.guild?.id)
        if (!voteConst) return

        const suggestion = await SuggestionsModule.getInstance().findSuggestionByMessage(reaction.message.id)
        if (!suggestion?.title) return

        const rating = SuggestionsModule.getInstance().getMessageRating(reaction.message)
        const { upVotes, downVotes } = rating

        if (downVotes / upVotes > voteConst) return this.onUnpopularSuggestion(reaction.message, suggestion)
        if (upVotes / downVotes > voteConst)
            return this.onPopularSuggestion(reaction.message, suggestion, rating)

        const ratio =
            upVotes > downVotes ? upVotes / downVotes : upVotes === downVotes ? 0 : -(downVotes / upVotes)
        await reaction.message.edit({
            embeds: [suggestion.toEmbed(ratio * (60 / voteConst) + 60)],
        })
    }

    async onUnpopularSuggestion(message: Message, suggestion: Suggestion) {
        if (suggestion.epic) return message.edit({ embeds: [suggestion.toEmbed(0)] })
        await message.delete()
        await suggestion.deleteOne()
    }

    async onPopularSuggestion(message: Message<true> & Base, suggestion: Suggestion, rating: MessageRating) {
        const embed = suggestion.toEmbed(-1)
        await message.edit({ embeds: [embed] }).catch(console.debugError)

        if (!suggestion.epic && message.guild) {
            await Suggestion.updateOne({ _id: suggestion._id }, { epic: Date.now() })
            suggestion.epic = new Date()     

            const channelId = message.client.getConfigValue(
                SuggestionsModule.ConfigKeys.EpicChannel,
                message.guildId,
            )
            if (channelId) {
                const channel = await message.guild.channels.fetch(channelId).catch(() => null)
                if (channel?.isTextBased()) {
                    embed.setFooter({ text: "Created at" }).setTimestamp(suggestion.createdAt)
                    await channel.send({ embeds: [embed] })
                    await channel.send({ content: `${rating}` })
                }
            }
        }
    }
}

const handler = new SuggestionsReactionHandler()
export default handler.onReactionUpdate.bind(handler)
