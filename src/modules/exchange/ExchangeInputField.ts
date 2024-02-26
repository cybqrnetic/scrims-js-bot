import { GuildMember, TextInputComponentData, codeBlock } from "discord.js"
import { DiscordUtil, MojangClient, MojangResolvedUser, TextUtil, TimeUtil } from "lib"
import { RecallExchangeInteraction } from "./exchange"

type InputFieldParseType = "Users" | "Offset" | "McAccount" | "URL"

export function ExchangeInputField<Parsed>(field: ExchangeInputField<Parsed>): ExchangeInputField<Parsed>
export function ExchangeInputField(type: InputFieldParseType, field: ExchangeInputField): ExchangeInputField
export function ExchangeInputField<Parsed>(
    type: ExchangeInputField<Parsed> | InputFieldParseType,
    field?: ExchangeInputField,
) {
    if (type === "Users")
        return ExchangeInputField({
            async parse(interaction, inputted) {
                if (!inputted) return []
                inputted = inputted.replace(/\n/g, "@").replace(/```|:|discord/g, "")

                const userResolvables = inputted
                    .split("@")
                    .map((v) => v.trim())
                    .filter((v) => v.length > 0)
                    .slice(0, 10)

                return userResolvables.map(
                    (resolvable) => DiscordUtil.parseUser(resolvable, interaction.guild!) ?? `${resolvable}`,
                )
            },
            stringify(parsed, inputted) {
                if (parsed.length > 0)
                    return parsed
                        .map((v) => (v instanceof GuildMember ? `${v} (${v.id})` : `**${v.slice(0, 37)}**`))
                        .map((v) => `\`•\` ${v}`)
                        .join("\n")
            },
            comment(parsed) {
                if (!parsed.filter((v) => v instanceof GuildMember).length)
                    return {
                        name: `:no_entry:  Invalid Discord User(s)`,
                        value: `*Please verify that the Usernames are correct before continuing.*`,
                    }
            },
            ...(field as ExchangeInputField<(GuildMember | string)[]>),
        })

    if (type === "Offset")
        return ExchangeInputField({
            async parse(interaction, inputted) {
                return TimeUtil.extractOffset(inputted)
            },
            stringify(parsed, inputted) {
                if (parsed !== null) return codeBlock(`${inputted} (${TimeUtil.stringifyOffset(parsed)})`)
            },
            comment(parsed) {
                if (parsed === null)
                    return {
                        name: `:x:  Invalid Time`,
                        value: "*Please input a valid time before continuing.*",
                    }
            },
            ...(field as ExchangeInputField<number | null>),
        })

    if (type === "McAccount")
        return ExchangeInputField({
            async parse(interaction, inputted) {
                return MojangClient.nameToProfile(inputted)
            },
            stringify(parsed, inputted) {
                if (parsed) return codeBlock(`${parsed.name} (${parsed.id})`)
            },
            comment(parsed) {
                if (!parsed)
                    return {
                        name: `:x:  Invalid Minecraft Account`,
                        value: "*Please correct this Minecraft username before continuing.*",
                    }
            },
            ...(field as ExchangeInputField<MojangResolvedUser | null>),
        })

    if (type === "URL")
        return ExchangeInputField({
            async parse(interaction, inputted) {
                return TextUtil.isValidHttpUrl(inputted) ? inputted : null
            },
            comment(parsed) {
                if (!parsed)
                    return { name: `:x:  Invalid URL`, value: "*Please correct this URL before continuing.*" }
            },
            ...(field as ExchangeInputField<string | null>),
        })

    return type
}

interface ExchangeInputFieldData<Parsed = unknown> {
    label: string
    parse?: (interaction: RecallExchangeInteraction, inputted: string) => Promise<Parsed>
    stringify?: (parsed: Parsed, inputted: string) => string | undefined
    comment?: (parsed: Parsed) => Omit<import("discord.js").EmbedField, "inline"> | undefined
}

export type ExchangeInputField<Parsed = unknown> = Omit<TextInputComponentData, "type"> &
    Partial<Pick<TextInputComponentData, "type">> &
    ExchangeInputFieldData<Parsed>
