import { I18n } from "./I18n"

export class LocalizedError extends Error {
    readonly params: unknown[]

    constructor(
        protected resourceId: string,
        ...params: unknown[]
    ) {
        super(resourceId)
        this.params = params
    }

    toMessage(i18n: I18n) {
        return i18n
            .getMessageOptions(this.resourceId, 0xfb2943, ...this.params)
            .removeMentions()
            .setEphemeral(true)
    }
}
