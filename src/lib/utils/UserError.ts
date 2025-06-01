import { MessageOptionsBuilder } from "./MessageOptionsBuilder"

export class UserError extends Error {
    protected payload: MessageOptionsBuilder

    constructor(title: string, description?: string) {
        super(description ?? title)
        this.payload = new MessageOptionsBuilder()
            .setEphemeral(true)
            .setContainerContent(description ? `## ${title}\n${description}` : title, 0xdc0023)
    }

    toMessage() {
        return this.payload
    }
}
