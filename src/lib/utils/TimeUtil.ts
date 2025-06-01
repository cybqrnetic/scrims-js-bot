import { DateTime } from "luxon"

// prettier-ignore
const UNITS: Record<string, number> = {
    s: 1, m: 60, h: 60 * 60, d: 60 * 60 * 24, w: 60 * 60 * 24 * 7,
    month: 60 * 60 * 24 * 30, y: 60 * 60 * 24 * 365
}

const NAMED_UNITS = [
    { label: "year", value: 31536000000 },
    { label: "month", value: 2592000000 },
    { label: "day", value: 86400000 },
    { label: "hour", value: 3600000 },
    { label: "minute", value: 60000 },
    { label: "second", value: 1000 },
]

export class TimeUtil {
    static removeMatch(content: string | [string], match: RegExpExecArray) {
        if (typeof content === "object") {
            content[0] = content[0].slice(0, match.index) + content[0].slice(match.index + match[0].length)
        }
    }

    static execRemove(regexp: RegExp, content: [string]) {
        const match = regexp.exec(content[0])
        if (match) {
            content[0] = content[0].slice(0, match.index) + content[0].slice(match.index + match[0].length)
        }
        return match
    }

    /**
     * @param content the regex matches will be removed from the content string so wrap in an array to get those changes
     * @returns duration in seconds
     */
    static parseDuration(content: string | [string]) {
        const value = typeof content === "object" ? content[0] : content
        const matches = value.matchAll(/(?:\s|^)([-|+]?\d+|a |an ) *(month|s|m|h|d|w|y)\S*( ago)?/gi)
        const seconds = Array.from(matches).reduce((secs, match) => {
            this.removeMatch(content, match)

            const [, val, unit, negate] = match
            return secs + (parseInt(val!) || 1) * UNITS[unit!.toLowerCase()]! * (negate ? -1 : 1)
        }, 0)

        return seconds
    }

    /**
     * @param content the regex matches will be removed from the content string so wrap in an array to get those changes
     * @returns a DateTime with the given offset and the parsed hour and minute
     */
    static parseTime(content: string | [string], offset = 0): DateTime | null {
        if (typeof content !== "object") content = [content]
        if (this.execRemove(/(\s|^)(now|rn)(\s|$)/i, content)) return DateTime.now()

        const match = this.execRemove(/(?:\s|^)(\d{1,2})(:\d{1,2})?\s*(a.?m.?|p.?m.?|\s|$)/i, content)
        if (!match) return null

        // eslint-disable-next-line prefer-const
        let [hour, minute] = [match[1], match[2]?.slice(1)].map((v) => parseInt(v!) || 0) as [number, number]
        if (match[3]?.toLowerCase()?.includes("p") && hour >= 1 && hour <= 11) hour += 12
        if (match[3]?.toLowerCase()?.includes("a") && hour === 12) hour = 24

        return DateTime.now().set({ hour, minute }).minus({ minutes: offset })
    }

    /**
     * @param content the regex matches will be removed from the content string so wrap in an array to get those changes
     * @returns a DateTime with the given offset and the parsed year, month and date
     */
    static parseDate(content: string | [string], offset = 0) {
        if (typeof content !== "object") content = [content]
        const today = DateTime.now().minus({ minutes: offset })

        if (this.execRemove(/(\s|^)(today|tdy)(\s|$)/i, content)) return today
        if (this.execRemove(/(\s|^)(tomorrow|tmr)(\s|$)/i, content)) return today.plus({ hours: 24 })

        const match = this.execRemove(/(\d{1,2})([.|/])(\d{1,2})?[.|/]?(\d{2,4})?/i, content)
        if (!match) return null

        let [day, month, year] = [match[1], match[3], match[4]].map((v) => parseInt(v!))
        if (match[2] === "/") [day, month] = [month, day]

        if (!month) month = today.month
        if (!year) year = today.year
        if (`${year}`.length <= 2) year = parseInt(`${today.year}`.slice(0, 2) + year)

        return today.set({ year, month, day }).minus({ minutes: offset })
    }

    static parseOffset(content: string) {
        const time = this.parseTime(content)
        if (!time) return null

        const currentTime = new Date().getUTCHours() * 60 + new Date().getUTCMinutes()
        const playersTime = time.hour * 60 + time.minute

        let difference = playersTime - currentTime
        if (Math.abs(difference) >= 720) {
            difference = 1440 - Math.abs(difference)
            if (playersTime > currentTime) difference *= -1
        }

        return Math.round(difference / 30) * 30
    }

    /**
     * @param delta number in milliseconds
     * @param precision the amount of units to show
     */
    static stringifyTimeDelta(delta: number, precision = 2, def = "less than a second") {
        const parts = []
        for (const unit of NAMED_UNITS) {
            const count = Math.floor(delta / unit.value)
            if (count >= 1) {
                parts.push(`${count} ${unit.label}${count !== 1 ? "s" : ""}`)
                delta -= count * unit.value
            }
            if (parts.length === precision) break
        }

        if (!parts.length) return def
        return parts.join(" ")
    }

    static stringifyOffset(offset: number | undefined | null) {
        if (!offset) return `±00:00`

        const prefix = offset < 0 ? "-" : "+"
        const hours = `${Math.abs(Math.floor(offset / 60))}`.padStart(2, "0")
        const mins = `${Math.abs(offset % 60)}`.padStart(2, "0")
        return `${prefix}${hours}:${mins}`
    }
}
