import { bold, inlineCode, italic } from "discord.js"
import * as util from "node:util"

interface Time {
    day: number
    hour: number
    min: number
}

interface StringFormatOptions {
    /** What to return if any params are falsely */
    unknownCase?: string
}

export class TextUtil {
    static stripText(text: string, charLimit = Infinity) {
        while (text.includes("\n\n\n")) text = text.replace("\n\n\n", "\n\n")

        const lines = text.split("\n").map((v) => v.trim())
        if (lines.length > 10) text = lines.slice(0, 10).join("\n") + lines.slice(10).join(" ")

        return this.limitText(text.trim(), charLimit)
    }

    static limitText(text: string, charLimit: number, hint = " ...and more") {
        if (text.length > charLimit) return text.slice(0, charLimit - hint.length) + hint
        return text
    }

    static reduceArray(arr: string[], charLimit: number, start = "") {
        return arr
            .reduce<[string, string]>(
                ([pv, am], cv, i) => {
                    const val = [pv, cv].join("\n")
                    const andMore = `\n*...and ${arr.length - i} more*`
                    if (val.length + andMore.length > charLimit) return [pv, am || andMore]
                    return [val, am]
                },
                [start, ""]
            )
            .join("")
    }

    static conditionallyFormat(str: string, doFormat: boolean) {
        return doFormat ? inlineCode(str) : str
    }

    /** @param delta Number of seconds to stringify */
    static stringifyTimeDelta(delta: number, withoutFormatting = false) {
        const layers: Time = { day: 86400, hour: 3600, min: 60 }
        const timeLeft: Time = { day: 0, hour: 0, min: 0 }
        if (delta < 60) return this.conditionallyFormat("1min", !withoutFormatting)

        for (const [layer, value] of Object.entries(layers)) {
            const amount = Math.floor(delta / value)
            if (amount < 1) continue
            delta -= amount * value
            timeLeft[layer as keyof Time] += amount
        }

        return Object.entries(timeLeft)
            .filter(([, value]) => value > 0)
            .map(([name, value]) => `${value}${value > 1 ? `${name}s` : name}`)
            .map((v) => this.conditionallyFormat(v, !withoutFormatting))
            .join(" ")
    }

    static stringifyArray(array: unknown[]) {
        return [array.slice(0, -1).join(", "), array.slice(-1)[0]].filter((v) => v).join(" and ")
    }

    static format(string: string, ...params: unknown[]) {
        if (params.some((v) => !v)) return ""
        return util.format(string, ...params)
    }

    static isValidHttpUrl(string: string) {
        try {
            return new URL(string).protocol.startsWith("http")
        } catch (_) {
            return false
        }
    }

    static snakeToUpperCamelCase(str: string) {
        return str.replace(/(?:^|_)([a-z])/g, (_, char) => char.toUpperCase())
    }

    static snakeToNormalCase(str: string) {
        return str.replaceAll("_", " ")
    }

    static capitalize(str: string) {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
    }

    static stringifyObject<T = unknown>(obj: T[] | Record<PropertyKey, T> | undefined | null, max: number) {
        if (!obj) return italic("None")
        if (!Object.values(obj).length) return italic("None")

        const stringifyObj = <T, U>(arr: T[], mapper: (item: T) => U) =>
            arr.slice(0, max).map(mapper).join("\n") + (arr.length > max ? "\n... and more" : "")

        if (Array.isArray(obj)) return stringifyObj(obj, (value) => `${inlineCode("•")} ${value}`)
        else
            return stringifyObj(
                Object.entries(obj),
                ([key, value]) => `${inlineCode("•")} ${bold(`${key}:`)} ${inlineCode(String(value))}`
            )
    }
}
