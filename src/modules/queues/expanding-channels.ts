import { Config } from "@module/config"
import { Events, VoiceBasedChannel } from "discord.js"
import { BotListener } from "lib"

const MIN_CHANNELS = Config.declareType("Minimum Expanding Channels")
const MAX_CHANNELS = Config.declareType("Maximum Expanding Channels")

BotListener(Events.VoiceStateUpdate, async (_bot, { channel: oldChannel }, { channel: newChannel }) => {
    if (oldChannel?.id === newChannel?.id) return

    if (oldChannel && getBaseName(oldChannel.name) !== oldChannel.name) {
        const emptySiblingsChannels = getSiblingChannels(oldChannel)
            ?.filter((c) => c.members.size === 0)
            .sort((a, b) => b.position - a.position)

        const minChannels = parseInt(Config.getConfigValue(MIN_CHANNELS, oldChannel.guildId, "1"))

        if (emptySiblingsChannels && emptySiblingsChannels.size > minChannels) {
            await emptySiblingsChannels?.first()?.delete().catch(console.error)
        }
    }

    if (newChannel?.members.size === 1 && getBaseName(newChannel.name) !== newChannel.name) {
        const siblingsChannels = getSiblingChannels(newChannel)?.sort((a, b) => b.position - a.position)

        const maxChannels = parseInt(Config.getConfigValue(MAX_CHANNELS, newChannel.guildId, "15"))
        const newChannelCount = (siblingsChannels?.size ?? 0) + 1

        if (newChannelCount <= maxChannels) {
            await siblingsChannels?.first()?.clone({
                name: `${getBaseName(newChannel.name)}#${newChannelCount}`,
            })
        }
    }
})

function getSiblingChannels(channel: VoiceBasedChannel) {
    if (!channel.parent) return

    const baseName = getBaseName(channel.name)
    return channel.parent.children.cache.filter((c) => getBaseName(c.name) === baseName)
}

function getBaseName(channelName: string) {
    return channelName.replace(/#\d+$/, "")
}
