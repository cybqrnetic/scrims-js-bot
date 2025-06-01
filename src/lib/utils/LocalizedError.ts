import { I18n } from "./I18n"
import { MessageOptionsBuilder } from "./MessageOptionsBuilder"

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
        const content = i18n.get(this.resourceId, ...this.params)
        return new MessageOptionsBuilder()
            .setContainerContent(content, 0xfb2943)
            .removeMentions()
            .setEphemeral(true)
    }
}
