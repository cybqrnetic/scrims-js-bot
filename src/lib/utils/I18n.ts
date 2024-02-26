import { EmbedBuilder } from "discord.js"
import fs from "fs"
import path from "path"

import { MessageOptionsBuilder } from "./MessageOptionsBuilder"

const DEFAULT_LOCALE = "en-US"
const UNKNOWN_RESOURCE = "UNKNOWN_RESOURCE"

interface Resources {
    [x: string]: string | Resources
}

/**
 * Resource identifiers should be in **snake_case** (all lowercase & underscores).
 * - **.** Represents a new depth in the language file.
 * - **-/+** At the start of a identifier means that the resource should be returned in all lowercase/uppercase.
 * - **${resource_id}** Indicates that a different resource should be inserted.
 * - **§{0-∞}** Indicates that a parameter with a certain index should be inserted.
 * - **?(...)** Indicates that anything in the brackets should be discarded if anything unknown comes up.
 */
export class I18n {
    protected resources: Resources = {}
    static instances: Record<string, I18n> = {}

    static getInstance(locale: string = DEFAULT_LOCALE) {
        return this.instances[locale] ?? this.instances[DEFAULT_LOCALE]
    }

    static getLocalizations(identifier: string, ...params: any[]) {
        return Object.fromEntries(
            Object.entries(this.instances)
                .map(([_, i18n]) => [_, i18n.get(identifier, ...params)])
                .filter(([_, v]) => v !== UNKNOWN_RESOURCE),
        )
    }

    static loadLocal(localName: string, path: string) {
        const resources = JSON.parse(fs.readFileSync(path, { encoding: "utf8" }))
        if (localName in I18n.instances) I18n.instances[localName].mergeResources(resources)
        else I18n.instances[localName] = new I18n(resources)
    }

    static loadLocales(dir: string) {
        const files = fs.readdirSync(dir)
        files.forEach((fileName) => this.loadLocal(fileName.slice(0, -5), path.join(dir, fileName)))
    }

    constructor(resources: Resources) {
        Object.defineProperty(this, "resources", { value: resources })
    }

    mergeResources(resources: Resources) {
        this.resources = { ...this.resources, ...resources }
    }

    get(resourceId: string, ...params: any[]) {
        return this._get(resourceId, params, true) as string
    }

    has(resourceId: string) {
        return this._get(resourceId) !== UNKNOWN_RESOURCE
    }

    hasString(resourceId: string) {
        return this._get(resourceId, [], true) !== UNKNOWN_RESOURCE
    }

    getMessageOptions(resourceId: string, ...params: any[]) {
        const val = this._get(resourceId, params)
        if (typeof val === "string") return new MessageOptionsBuilder().setContent(val).removeMentions()
        return new MessageOptionsBuilder().addEmbeds(this.getEmbed(resourceId, ...params)).removeMentions()
    }

    getEmbed(identifier: string, ...params: any[]) {
        const data = params.length === 1 && params[0] instanceof Object ? params[0] : { description: params }
        const value = this._get(identifier, data?.description)
        if (typeof value === "string") return new EmbedBuilder().setDescription(value)
        return new EmbedBuilder(this.formatObject(value, data))
    }

    getObject(identifier: string, ...params: any[]) {
        const data = params.length === 1 && params[0] instanceof Object ? params[0] : params
        const value = this._get(identifier)
        if (typeof value === "string") return {}
        return this.formatObject(value, data)
    }

    protected _get(identifier: string, params: any[] = [], forceString = false) {
        const toLower = identifier.startsWith("-")
        const toUpper = identifier.startsWith("+")
        const args = (toLower || toUpper ? identifier.slice(1) : identifier).split(".").filter((v) => v)

        const val = args.reduce((pv: any, cv) => pv?.[cv], this.resources) as string
        if (typeof val !== "string" && forceString) return UNKNOWN_RESOURCE
        if (typeof val === "string")
            return this.formatString(toLower ? val.toLowerCase() : toUpper ? val.toUpperCase() : val, params)
        return val ?? UNKNOWN_RESOURCE
    }

    protected formatObject(
        obj: Record<string, any>,
        params: any[] | Record<string, any[]> = [],
    ): Record<string, any> {
        const getParams = (key: string) => (params instanceof Array ? params : params[key])
        return Object.fromEntries(
            Object.entries(obj).map(([key, val]) => [
                key,
                val instanceof Object
                    ? this.formatObject(val, getParams(key))
                    : this.formatString(val, getParams(key)),
            ]),
        )
    }

    protected formatString(string: string, params: any[] = []) {
        const format = (str: string): { v: string; missing: boolean } => {
            const refReplaces = Array.from(str.matchAll(/\${(.+?)}/g)).map(([m, id]) => [
                m,
                this._get(id, params, true),
            ])
            const idxReplaces = Array.from(str.matchAll(/§{(\d+?)}/g)).map(([m, i]) => [
                m,
                params[parseInt(i)] ?? UNKNOWN_RESOURCE,
            ])
            const orderedReplaces = Array.from(str.matchAll(/%s/g)).map(([m], i) => [
                m,
                params[i] ?? UNKNOWN_RESOURCE,
            ])
            const replaces = [...orderedReplaces, ...refReplaces, ...idxReplaces]
            replaces.forEach(([m, r]) => (str = str.replace(m, r === UNKNOWN_RESOURCE ? "unknown" : r)))
            return { missing: replaces.some(([_, r]) => r === UNKNOWN_RESOURCE), v: str }
        }

        Array.from(string.matchAll(/\?\((.+?)\)/g)).forEach(([m, content]) => {
            const { missing, v } = format(content)
            string = string.replace(m, missing ? "" : v)
        })

        return format(string).v
    }
}
