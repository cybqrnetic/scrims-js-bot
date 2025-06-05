import { ContainerBuilder, EmbedBuilder } from "discord.js"
import fs from "fs/promises"
import path from "path"

import { MessageOptionsBuilder } from "./MessageOptionsBuilder"

export const DEFAULT_LOCALE = process.env["DEFAULT_LOCALE"] ?? "en-US"
const UNKNOWN_RESOURCE = "UNKNOWN_RESOURCE"

const GROUPS_REGEX = /(\?)\((.+?)\)/g
const REPLACES_REGEX = /(\$){(.+?)}|(&){(.+?)}|(§){(\d+?)}|%s/g

/**
 * Resource identifiers should be in **snake_case** (all lowercase & underscores).
 * - **.** Represents a new depth in the language file.
 * - **-/+** At the start of a identifier means that the resource should be returned in all lowercase/uppercase.
 * - **${resource_id}** Indicates that a different resource should be inserted.
 * - **§{0-∞}** Indicates that a parameter with a certain index should be inserted.
 * - **&{name}** Indicates that a named parameter should be inserted.
 * - **?(...)** Indicates that anything in the brackets should be discarded if anything unknown comes up.
 */
export class I18n {
    static instances: Record<string, I18n> = {}
    static default: I18n

    static getInstance(locale?: string) {
        return (locale && this.instances[locale]) || this.default
    }

    static getInstances() {
        return Object.values(this.instances)
    }

    static getLocalizations(identifier: string, ...params: unknown[]) {
        return Object.fromEntries(
            this.getInstances()
                .filter((i18n) => i18n.hasString(identifier))
                .map((i18n): [string, string] => [i18n.locale, i18n.get(identifier, ...params)]),
        )
    }

    static async loadLocale(name: string, path: string) {
        const data = await fs.readFile(path, { encoding: "utf8" })
        const resources = Parser.parse(JSON.parse(data) as Data)
        this.instances[name] = new I18n(resources, name)
    }

    static async loadLocales(dir: string) {
        const files = await fs.readdir(dir)
        await Promise.all(files.map((name) => this.loadLocale(name.slice(0, -5), path.join(dir, name))))

        this.default = this.instances[DEFAULT_LOCALE]!
        if (!this.default) {
            throw new Error(`Default locale not found: ${DEFAULT_LOCALE}`)
        }
    }

    constructor(
        private readonly resources: Resources,
        readonly locale: string,
    ) {}

    has(id: string) {
        return this.lookup(splitId(id)) !== undefined
    }

    hasString(id: string) {
        return Array.isArray(this.lookup(splitId(id)))
    }

    get(id: string, ...params: unknown[]) {
        const value = this.lookup(splitId(id))
        if (value === undefined) {
            console.warn(`[I18n] Resource "${id}" not found in locale "${this.locale}".`)
            return UNKNOWN_RESOURCE
        } else if (!Array.isArray(value)) {
            console.warn(`[I18n] Resource "${id}" is not a string in locale "${this.locale}".`)
            return UNKNOWN_RESOURCE
        }

        return this.formatGroups(value, wrapParams(params))
    }

    getMessageOptions(id: string, accentColor?: number, ...params: unknown[]) {
        const value = this.lookup(id.split("."))
        if (value === undefined) {
            console.warn(`[I18n] Resource "${id}" not found in locale "${this.locale}".`)
            return new MessageOptionsBuilder().setContainerContent(UNKNOWN_RESOURCE, accentColor)
        }

        if (Array.isArray(value)) {
            return new MessageOptionsBuilder().setContainerContent(
                this.formatGroups(value, wrapParams(params)),
                accentColor,
            )
        }

        const message = this.formatObject(value, wrapParams(params)) as MessageData
        if (!message.title && !message.description && !message.footer) {
            console.warn(`[I18n] Resource "${id}" is not a valid message in locale "${this.locale}".`)
            return new MessageOptionsBuilder().setContainerContent(UNKNOWN_RESOURCE, accentColor)
        }

        const container = new ContainerBuilder().setAccentColor(accentColor)
        if (message.title)
            container.addTextDisplayComponents((text) => text.setContent(`### ${message.title!}`))
        if (message.description)
            container.addTextDisplayComponents((text) => text.setContent(message.description!))
        if (message.footer) {
            container
                .addSeparatorComponents()
                .addTextDisplayComponents((text) => text.setContent(`\n-# ${message.footer!}`))
        }

        return new MessageOptionsBuilder().setContainer(container)
    }

    getEmbed(id: string, ...params: unknown[]) {
        const value = this.lookup(splitId(id))
        if (value === undefined) return new EmbedBuilder().setDescription(UNKNOWN_RESOURCE)
        if (Array.isArray(value))
            return new EmbedBuilder().setDescription(this.formatGroups(value, wrapParams(params)))

        return new EmbedBuilder(this.formatObject(value, wrapParams(params)))
    }

    getObject<T extends object>(id: string, ...params: unknown[]): T {
        const value = this.lookup(splitId(id))
        if (value === undefined || Array.isArray(value)) return {} as T
        return this.formatObject(value, wrapParams(params)) as T
    }

    private lookup(id: string[]): Group[] | Resources | undefined {
        return id.reduce((pv, cv) => pv?.[cv] as Resources, this.resources)
    }

    private formatObject(obj: Resources, params: Params): Record<string, unknown> {
        return Object.fromEntries(
            Object.entries(obj).map(([key, val]) => [
                key,
                Array.isArray(val)
                    ? this.formatGroups(val, params)
                    : this.formatObject(val, params.fork(key)),
            ]),
        )
    }

    private formatGroups(groups: Group[], params: Params) {
        return groups.reduce((pv, cv) => pv + this.formatGroup(cv, params), "")
    }

    private formatGroup(group: Group, params: Params) {
        let output = ""
        for (const value of group.values) {
            if (typeof value === "string") {
                output += value
            } else if (value.id !== undefined) {
                const val = this.lookup(value.id.split)
                if (Array.isArray(val)) {
                    const str = this.formatGroups(val, params)
                    output += value.id.lower ? str.toLowerCase() : value.id.upper ? str.toUpperCase() : str
                } else {
                    if (group.optional) return ""
                    output += UNKNOWN_RESOURCE
                    console.warn(
                        `[I18n] Resource "${value.id.split.join(".")}" not found in locale "${this.locale}".`,
                    )
                }
            } else {
                let param
                if (value.idx !== undefined) {
                    param = params.get(value.idx)
                } else if (value.name !== undefined) {
                    param = params.getNamed(value.name)
                } else {
                    param = params.next()
                }

                if (param === undefined || param === null) {
                    if (group.optional) return ""
                } else {
                    output += param as string
                }
            }
        }
        return output
    }
}

interface MessageData {
    title?: string
    description?: string
    footer?: string
}

interface Identifier {
    split: string[]
    lower?: true
    upper?: true
}

interface Reference {
    id?: Identifier
    name?: string
    idx?: number
}

type Value = Reference | string

interface Group {
    values: Value[]
    optional?: true
}

interface Resources {
    [x: string]: Group[] | Resources
}

class Params {
    private array?: unknown[]
    constructor(
        private readonly values: unknown[] | Record<string, unknown>,
        private i: [number] = [0],
    ) {}

    private asArray() {
        if (this.array) return this.array
        return (this.array = Array.isArray(this.values)
            ? this.values
            : Object.values(this.values).flatMap((v) => v))
    }

    next() {
        return this.asArray()[this.i[0]++]
    }

    get(index: number) {
        return this.asArray()[index]
    }

    getNamed(name: string) {
        return Array.isArray(this.values) ? undefined : this.values[name]
    }

    fork(name: string) {
        const values = Array.isArray(this.values) ? [] : (this.values[name] as unknown[])
        return new Params(values, this.i)
    }
}

function wrapParams(params: unknown[]): Params {
    return params.length === 1 && typeof params[0] === "object"
        ? new Params(params[0] as Record<string, unknown>)
        : new Params(params)
}

function splitId(id: string) {
    return id.split(".")
}

interface Data {
    [x: string]: string | Data
}

class Parser {
    public static parse(data: Data): Resources {
        return Object.fromEntries(
            Object.entries(data).map(([key, value]) => [
                key,
                typeof value === "object" ? this.parse(value) : this.groups(value),
            ]),
        )
    }

    private static groups(value: string): Group[] {
        const groups: Group[] = []

        let j = 0
        for (const match of value.matchAll(GROUPS_REGEX)) {
            if (j !== match.index) {
                groups.push({ values: this.values(value.slice(j, match.index)) })
            }

            const group: Group = { values: this.values(match[2]!) }
            switch (match[1]) {
                case "?":
                    group.optional = true
                    break
            }

            groups.push(group)
            j = match.index + match[0].length
        }

        if (j < value.length) {
            groups.push({ values: this.values(value.slice(j, value.length)) })
        }

        return groups
    }

    private static values(value: string): Value[] {
        const values: Value[] = []

        let j = 0
        for (const match of value.matchAll(REPLACES_REGEX)) {
            if (j < match.index) {
                values.push(value.slice(j, match.index))
            }

            const ref: Reference = {}
            if (match[1] !== undefined) {
                ref.id = this.identifier(match[2]!)
            } else if (match[3] !== undefined) {
                ref.name = match[4]!
            } else if (match[5] !== undefined) {
                ref.idx = parseInt(match[6]!)
            }

            values.push(ref)
            j = match.index + match[0].length
        }

        if (j < value.length) {
            values.push(value.slice(j, value.length))
        }

        return values
    }

    private static identifier(value: string): Identifier {
        if (value.startsWith("-")) return { split: splitId(value.slice(1)), lower: true }
        if (value.startsWith("+")) return { split: splitId(value.slice(1)), upper: true }
        return { split: splitId(value) }
    }
}
