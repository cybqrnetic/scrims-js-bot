import {
    APIEmbed,
    APIMessageTopLevelComponent,
    ActionRowBuilder,
    AllowedMentionsTypes,
    BaseMessageOptions,
    BitField,
    BitFieldResolvable,
    ButtonBuilder,
    ContainerBuilder,
    EmbedBuilder,
    JSONEncodable,
    MessageActionRowComponentBuilder,
    MessageFlags,
    MessageFlagsString,
    MessageMentionOptions,
} from "discord.js"

type BuilderOrCallback<T> = ((builder: T) => T) | T
function resolveBuilder<T>(Builder: new () => T, resolvable: BuilderOrCallback<T>) {
    return resolvable instanceof Function ? resolvable(new Builder()) : resolvable
}

function resolveBuilders<T>(builder: new () => T, resolvables: BuilderOrCallback<T>[]) {
    return resolvables.map((v) => resolveBuilder(builder, v))
}

// content should be able to be null
const NULL = null as unknown as undefined

type CreateFlags =
    | MessageFlags.Ephemeral
    | MessageFlags.SuppressEmbeds
    | MessageFlags.SuppressNotifications
    | MessageFlags.IsComponentsV2

type CreateFlagsString = Extract<
    MessageFlagsString,
    "Ephemeral" | "SuppressEmbeds" | "SuppressNotifications" | "IsComponentsV2"
>

export class MessageOptionsBuilder {
    public content?: string
    public embeds: APIEmbed[]
    public components: APIMessageTopLevelComponent[]
    public allowedMentions: MessageMentionOptions
    public flags?: number
    private _flags?: BitField<CreateFlagsString, CreateFlags>

    constructor({ content, embeds, components, allowedMentions }: BaseMessageOptions = {}) {
        this.content = content ?? NULL
        this.embeds = (embeds as APIEmbed[]) ?? []
        this.components = (components as APIMessageTopLevelComponent[]) ?? []
        this.allowedMentions = allowedMentions ?? {
            parse: [AllowedMentionsTypes.User, AllowedMentionsTypes.Role],
        }
        this._flags = new BitField()
    }

    setFlag(flag: BitFieldResolvable<CreateFlagsString, CreateFlags>, value: boolean = true) {
        if (!this._flags) this._flags = new BitField()

        if (value) this._flags.add(flag)
        else this._flags.remove(flag)

        this.flags = this._flags?.valueOf()
        return this
    }

    setContainer(container: BuilderOrCallback<ContainerBuilder>) {
        this.setFlag(MessageFlags.IsComponentsV2)
        this.components = [resolveBuilder(ContainerBuilder, container).toJSON()]
        return this
    }

    setContainerContent(content: string, accentColor?: number) {
        return this.setContainer(
            new ContainerBuilder()
                .addTextDisplayComponents((text) => text.setContent(content))
                .setAccentColor(accentColor),
        )
    }

    setEphemeral(ephemeral: boolean) {
        return this.setFlag(MessageFlags.Ephemeral, ephemeral)
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
        this.content = content === null ? NULL : content === undefined ? undefined : `${content}`
        if (this.content && this.content.length > 2000)
            throw new TypeError("Message content can't be longer than 2000!")
        return this
    }

    editContent(editor: (content: string) => string) {
        return this.setContent(editor(this.content ?? ""))
    }

    addEmbeds(...embeds: BuilderOrCallback<EmbedBuilder>[]) {
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

    addButtons(...buttons: BuilderOrCallback<ButtonBuilder>[]) {
        if (buttons.length > 5) throw new TypeError("There can't be more than 5 buttons per action row!")
        return this.addComponents(
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                ...resolveBuilders(ButtonBuilder, buttons),
            ),
        )
    }

    addComponents(...components: JSONEncodable<APIMessageTopLevelComponent>[]) {
        this.components.push(...components.map((v) => v.toJSON()))
        if (components.length > 5) throw new TypeError("There can't be more than 5 action rows!")
        return this
    }

    createMultipleEmbeds<T>(
        items: T[],
        getEmbedCall: (items: T[], index: number, groups: T[][]) => EmbedBuilder,
    ) {
        let groups: T[][] = Array.from({ length: Math.ceil(items.length / 25) })
        if (groups.length > 10) throw new TypeError("There can't be more than 10 embeds!")

        const groupSize = Math.floor(items.length / groups.length)
        groups = groups.map((_, i) =>
            items.slice(i * groupSize, i === groups.length - 1 ? items.length : (i + 1) * groupSize),
        )

        return this.addEmbeds(
            ...groups.map((items, idx, groups) => {
                const embed = getEmbedCall(items, idx, groups)
                if (!embed.data.footer && groups.length > 1)
                    embed.setFooter({ text: `Page ${idx + 1}/${groups.length}` })
                return embed
            }),
        )
    }
}
