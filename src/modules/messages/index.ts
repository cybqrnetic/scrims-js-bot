import { GuildBasedChannel, GuildMember } from "discord.js"
import { BotModule, LocalizedError, MessageOptionsBuilder } from "lib"

export interface MessageBuilderOptions {
    name: string
    builder: (
        builder: MessageOptionsBuilder,
        member: GuildMember,
    ) => Promise<MessageOptionsBuilder> | MessageOptionsBuilder
    permission?: string
}

const builders = new Set<MessageBuilderOptions>()
export function BotMessage(builder: MessageBuilderOptions) {
    builders.add(builder)
}

export class BotMessageManager extends BotModule {
    addBuilder(builder: MessageBuilderOptions) {
        builders.add(builder)
    }

    getNames(member: GuildMember, _channel: GuildBasedChannel) {
        return Array.from(builders)
            .filter((v) => this.hasPermission(member, v))
            .map((v) => v.name)
    }

    async get(name: string, member: GuildMember, _channel: GuildBasedChannel) {
        const builder = Array.from(builders).find((v) => v.name === name)
        if (!builder) return null

        if (!this.hasPermission(member, builder)) throw new LocalizedError("missing_permissions")
        return builder.builder(new MessageOptionsBuilder(), member)
    }

    protected hasPermission(member: GuildMember, builder: MessageBuilderOptions) {
        if (!builder.permission) return true
        return member.hasPermission(builder.permission)
    }
}

export const messages = BotMessageManager.getInstance()
