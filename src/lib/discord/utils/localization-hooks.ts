import {
    ContextMenuCommandBuilder,
    Guild,
    SharedNameAndDescription,
    SlashCommandAttachmentOption,
    SlashCommandBooleanOption,
    SlashCommandBuilder,
    SlashCommandChannelOption,
    SlashCommandIntegerOption,
    SlashCommandMentionableOption,
    SlashCommandNumberOption,
    SlashCommandRoleOption,
    SlashCommandStringOption,
    SlashCommandSubcommandBuilder,
    SlashCommandSubcommandGroupBuilder,
    SlashCommandUserOption,
} from "discord.js"

import { DEFAULT_LOCALE, I18n } from "../../utils/I18n"

declare module "discord.js" {
    interface SharedNameAndDescription {
        setLocalizations(resourceId: string, ...params: unknown[]): this
    }

    interface ContextMenuCommandBuilder {
        setLocalizations(resourceId: string, ...params: unknown[]): this
    }

    interface Guild {
        i18n(): I18n
    }
}

;[
    SharedNameAndDescription.prototype,
    SlashCommandBuilder.prototype,
    SlashCommandSubcommandBuilder.prototype,
    SlashCommandSubcommandGroupBuilder.prototype,
    SlashCommandRoleOption.prototype,
    SlashCommandBooleanOption.prototype,
    SlashCommandAttachmentOption.prototype,
    SlashCommandChannelOption.prototype,
    SlashCommandIntegerOption.prototype,
    SlashCommandNumberOption.prototype,
    SlashCommandStringOption.prototype,
    SlashCommandUserOption.prototype,
    SlashCommandMentionableOption.prototype,
].forEach((prototype) => {
    prototype.setLocalizations = function (resourceId) {
        const names = I18n.getLocalizations(`${resourceId}.name`)
        if (!this.name) this.setName(names[DEFAULT_LOCALE]!)
        this.setNameLocalizations(names)

        const descriptions = I18n.getLocalizations(`${resourceId}.description`)
        if (!this.description) this.setDescription(descriptions[DEFAULT_LOCALE]!)
        this.setDescriptionLocalizations(descriptions)

        return this
    }
})

ContextMenuCommandBuilder.prototype.setLocalizations = function (resourceId) {
    const names = I18n.getLocalizations(resourceId)
    if (!this.name) this.setName(names[DEFAULT_LOCALE]!)
    this.setNameLocalizations(names)

    return this
}

Guild.prototype.i18n = function () {
    return I18n.getInstance(this.preferredLocale)
}
