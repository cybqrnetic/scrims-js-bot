import {
    APIActionRowComponent,
    APIEmbed,
    APIMessageActionRowComponent,
    ActionRowBuilder,
    AllowedMentionsTypes,
    BaseMessageOptions,
    ButtonBuilder,
    EmbedBuilder,
    MessageActionRowComponentBuilder,
    MessageMentionOptions,
} from "discord.js"

type BuilderOrBuildCall<T> = ((builder: T) => T) | T
function resolveBuilders<T>(Builder: new () => T, resolvables: BuilderOrBuildCall<T>[]) {
    return resolvables.map((v) => (v instanceof Function ? v(new Builder()) : v))
}

// content should be able to be null
const NULL = null as unknown as undefined

export class MessageOptionsBuilder {
    public content?: string
    public embeds: APIEmbed[]
    public components: APIActionRowComponent<APIMessageActionRowComponent>[]
    public allowedMentions: MessageMentionOptions
    public ephemeral?: boolean

    constructor({ content, embeds, components, allowedMentions }: BaseMessageOptions = {}) {
        this.content = content ?? NULL
        this.embeds = (embeds as APIEmbed[]) ?? []
        this.components = (components as APIActionRowComponent<APIMessageActionRowComponent>[]) ?? []
        this.allowedMentions = allowedMentions ?? {
            parse: [AllowedMentionsTypes.User, AllowedMentionsTypes.Role],
        }
    }

    setEphemeral(ephemeral: boolean) {
        this.ephemeral = ephemeral
        return this
    }

    setAllowedMentions(allowedMentions: MessageMentionOptions = {}) {
        this.allowedMentions = allowedMentions
        return this
    }

    removeMentions() {
        this.allowedMentions = { parse: [] }
        return this
    }

    setContent(content?: string | null) {
        this.content = content === null ? NULL : !content ? undefined : `${content}`
        if (this.content && this.content.length > 2000)
            throw new TypeError("Message content can't be longer than 2000!")
        return this
    }

    editContent(editor: (content: string) => string) {
        return this.setContent(editor(this.content ?? ""))
    }

    addEmbeds(...embeds: BuilderOrBuildCall<EmbedBuilder>[]) {
        this.embeds.push(...resolveBuilders(EmbedBuilder, embeds).map((v) => v.toJSON()))
        if (this.embeds.length > 10) throw new TypeError("You can't have more than 10 embeds!")
        return this
    }

    addActions(...actions: MessageActionRowComponentBuilder[]) {
        if (actions.length > 5) throw new TypeError("There can't be more than 5 components per action row!")
        return this.addComponents(
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...actions),
        )
    }

    addButtons(...buttons: BuilderOrBuildCall<ButtonBuilder>[]) {
        if (buttons.length > 5) throw new TypeError("There can't be more than 5 buttons per action row!")
        return this.addComponents(
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                ...resolveBuilders(ButtonBuilder, buttons),
            ),
        )
    }

    addComponents(...components: ActionRowBuilder<MessageActionRowComponentBuilder>[]) {
        this.components.push(...components.map((v) => v.toJSON()))
        if (components.length > 5) throw new TypeError("There can't be more than 5 action rows!")
        return this
    }

    createMultipleEmbeds<T>(
        items: T[],
        getEmbedCall: (items: T[], index: number, containers: T[][]) => EmbedBuilder,
    ) {
        const containers = Array.from(new Array(Math.ceil(items.length / 25)).keys())
        if (containers.length > 10) throw new TypeError("There can't be more than 10 embeds!")

        const containerSize = Math.floor(items.length / containers.length)
        const overflow = items.length % containerSize
        const embedData = containers.map((_, i) => items.slice(i * containerSize, (i + 1) * containerSize))

        const getEmbed = (items: T[], idx: number, containers: T[][]) => {
            const embed = getEmbedCall(items, idx, containers)
            if (!embed.data.footer && containers.length > 1)
                embed.setFooter({ text: `Page ${idx + 1}/${containers.length}` })
            return embed
        }

        const lastIdx = embedData.length - 1
        if (overflow > 0) embedData[lastIdx] = embedData[lastIdx]!.concat(items.slice(-overflow))
        return this.addEmbeds(...embedData.map((items, idx, containers) => getEmbed(items, idx, containers)))
    }
}
