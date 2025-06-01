import {
    ChatInputCommandInteraction,
    Client,
    ClientEvents,
    ContextMenuCommandBuilder,
    ContextMenuCommandInteraction,
    MessageComponentInteraction,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
    SlashCommandSubcommandsOnlyBuilder,
} from "discord.js"

import { auditedEvents, AuditedEvents, bot, CacheTypeReducer, Command, CommandBase, commands } from "."

export function BotListener<E extends keyof ClientEvents>(
    event: E,
    listener: (bot: Client, ...args: ClientEvents[E]) => unknown,
) {
    bot.on(event, (...args) => listener(bot, ...args))
}

export function BotAuditListener<E extends keyof AuditedEvents>(
    event: E,
    listener: (bot: Client, ...args: AuditedEvents[E]) => unknown,
) {
    auditedEvents.on(event, (...args) => listener(bot, ...args))
}

export function SlashCommand<UserInstall extends boolean = false, AnyContext extends boolean = false>(
    command: CommandBase<
        SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder,
        UserInstall,
        AnyContext,
        ChatInputCommandInteraction<CacheTypeReducer<UserInstall, AnyContext>>
    >,
) {
    commands.add(command as Command)
    return command
}

export function ContextMenu<UserInstall extends boolean = false, AnyContext extends boolean = false>(
    command: CommandBase<
        ContextMenuCommandBuilder,
        UserInstall,
        AnyContext,
        ContextMenuCommandInteraction<CacheTypeReducer<UserInstall, AnyContext>>
    >,
) {
    commands.add(command as Command)
    return command
}

export function Component<UserInstall extends boolean = false, AnyContext extends boolean = false>(
    command: CommandBase<
        string,
        UserInstall,
        AnyContext,
        MessageComponentInteraction<CacheTypeReducer<UserInstall, AnyContext>>
    >,
) {
    commands.add(command as Command)
    return command
}
