import { GuildMember } from "discord.js"

import { ScrimsBot } from "."
import { LocalizedError } from "../utils/LocalizedError"
import { MessageOptionsBuilder } from "../utils/MessageOptionsBuilder"
import { Permissions } from "./PermissionsManager"

export interface MessageBuilderOptions {
    name: string
    builder: (
        builder: MessageOptionsBuilder,
        member: GuildMember
    ) => Promise<MessageOptionsBuilder> | MessageOptionsBuilder
    permissions?: Permissions
}

const builders = new Set<MessageBuilderOptions>()
export function BotMessage(builder: MessageBuilderOptions) {
    builders.add(builder)
}

export class BotMessageManager {
    constructor(protected readonly bot: ScrimsBot) {}

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
        return builder.builder(new MessageOptionsBuilder(), member)
    }

    protected hasPermission(member: GuildMember, builder: MessageBuilderOptions) {
        if (!builder.permissions) return true
        return this.bot.permissions.hasPermissions(member, builder.permissions)
    }
}
