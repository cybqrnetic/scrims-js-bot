import {
    ContextMenuCommandBuilder,
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

import { I18n } from "../../utils/I18n"

declare module "discord.js" {
    interface SharedNameAndDescription {
        setNameAndDescription(resourceId: string, ...params: unknown[]): this
    }
}

interface SharedNameAndDescriptionOverwrites {
    readonly name: string
    readonly description: string
    setNameLocalizations(resourceId: string, ...params: unknown[]): this
    setDescriptionLocalizations(resourceId: string, ...params: unknown[]): this
    setName(resourceId: string, ...params: unknown[]): this
    setDescription(resourceId: string, ...params: unknown[]): this
    setNameAndDescription(resourceId: string, ...params: unknown[]): this
}

const SharedNameAndDescriptionPrototype =
    SharedNameAndDescription.prototype as unknown as SharedNameAndDescriptionOverwrites

const setNameLocalizations = SharedNameAndDescription.prototype.setNameLocalizations
const setDescriptionLocalizations = SharedNameAndDescription.prototype.setDescriptionLocalizations
const setDescription = SharedNameAndDescription.prototype.setDescription
const setName = SharedNameAndDescription.prototype.setName

const overwritePrototype = (prototype: typeof SharedNameAndDescriptionPrototype) => {
    prototype.setNameLocalizations = function (resourceId, ...params) {
        setNameLocalizations.apply(this, [I18n.getLocalizations(resourceId as string, ...params)])
        return this
    }

    prototype.setDescriptionLocalizations = function (resourceId, ...params) {
        setDescriptionLocalizations.apply(this, [I18n.getLocalizations(resourceId as string, ...params)])
        return this
    }

    prototype.setName = function (resourceId, ...params) {
        if (!I18n.getInstance().hasString(resourceId)) setName.apply(this, [resourceId])
        else {
            if (!this.name) setName.apply(this, [I18n.getInstance().get(resourceId, ...params)])
            setNameLocalizations.apply(this, [I18n.getLocalizations(resourceId, ...params)])
        }
        return this
    }

    prototype.setDescription = function (resourceId, ...params) {
        if (!I18n.getInstance().hasString(resourceId)) setDescription.apply(this, [resourceId])
        else {
            if (!this.description) setDescription.apply(this, [I18n.getInstance().get(resourceId, ...params)])
            setDescriptionLocalizations.apply(this, [I18n.getLocalizations(resourceId, ...params)])
        }
        return this
    }

    prototype.setNameAndDescription = function (resourceId, ...params) {
        this.setName(`${resourceId}.name`, ...params)
        this.setDescription(`${resourceId}.description`, ...params)
        return this
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
].forEach((val) => overwritePrototype(val as unknown as typeof SharedNameAndDescriptionPrototype))

export class LocalizedSlashCommandBuilder extends SlashCommandBuilder {
    constructor(resourceId?: string) {
        super()
        if (resourceId) this.setNameAndDescription(resourceId)
    }
}

export class LocalizedSlashCommandSubcommandBuilder extends SlashCommandSubcommandBuilder {
    constructor(resourceId?: string) {
        super()
        if (resourceId) this.setNameAndDescription(resourceId)
    }

    setNameAndDescription(resourceId: string, ...params: unknown[]) {
        SharedNameAndDescriptionPrototype.setNameAndDescription.apply(this, [resourceId, ...params])
        return this
    }
}

export class LocalizedSlashCommandSubcommandGroupBuilder extends SlashCommandSubcommandGroupBuilder {
    constructor(resourceId?: string) {
        super()
        if (resourceId) this.setNameAndDescription(resourceId)
    }

    setNameAndDescription(resourceId: string, ...params: unknown[]) {
        SharedNameAndDescriptionPrototype.setNameAndDescription.apply(this, [resourceId, ...params])
        return this
    }
}

export class LocalizedContextMenuCommandBuilder extends ContextMenuCommandBuilder {
    constructor(resourceId?: string) {
        super()
        if (resourceId) this.setName(resourceId)
    }

    /** Sets the name and the name localizations */
    setName(resourceId: string, ...params: unknown[]) {
        this.setNameLocalizations(I18n.getLocalizations(resourceId, ...params))
        return super.setName(I18n.getInstance().get(resourceId, ...params))
    }
}
