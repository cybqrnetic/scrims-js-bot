import { I18n } from "./I18n"
import { MessageOptionsBuilder } from "./MessageOptionsBuilder"

export class LocalizedError extends Error {
    protected params: unknown[]

    constructor(protected resourceId: string, ...params: unknown[]) {
        super(resourceId)
        this.params = params
    }

    toMessagePayload(i18n: I18n) {
        const embed = i18n.getEmbed(this.resourceId, ...this.params).setColor(0xfb2943)
        return new MessageOptionsBuilder().addEmbeds(embed).removeMentions().setEphemeral(true)
    }
}
