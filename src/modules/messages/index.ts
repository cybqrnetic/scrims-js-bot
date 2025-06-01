import { GuildMember } from "discord.js"
import { BotModule, I18n, LocalizedError, MessageOptionsBuilder } from "lib"

export interface MessageBuilderOptions {
    name: string
    builder: (i18n: I18n, member: GuildMember) => Promise<MessageOptionsBuilder> | MessageOptionsBuilder
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

    getNames(member: GuildMember) {
        return Array.from(builders)
            .filter((v) => this.hasPermission(member, v))
            .map((v) => v.name)
    }

    async get(name: string, member: GuildMember) {
        const builder = Array.from(builders).find((v) => v.name === name)
        if (!builder) return null

        if (!this.hasPermission(member, builder)) throw new LocalizedError("missing_permissions")
        return builder.builder(member.guild.i18n(), member)
    }

    protected hasPermission(member: GuildMember, builder: MessageBuilderOptions) {
        if (!builder.permission) return true
        return member.hasPermission(builder.permission)
    }
}

export const messages = BotMessageManager.getInstance()
