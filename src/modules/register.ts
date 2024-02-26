import { ButtonBuilder, ButtonStyle, EmbedBuilder, TextInputStyle, User } from "discord.js"
import {
    BotMessage,
    Command,
    CommandHandlerInteraction,
    MessageOptionsBuilder,
    MojangClient,
    MojangResolvedUser,
    UserProfile,
} from "lib"

import { Colors } from "@Constants"
import { DateTime } from "luxon"
import {
    ExchangeHandler,
    ExchangeHandlerState,
    ExchangeInputField,
    RecallExchangeInteraction,
} from "./exchange"

export const FIELDS = [
    ExchangeInputField("McAccount", {
        customId: "mc_account",
        label: "What is your Minecraft IGN?",
        style: TextInputStyle.Short,
        minLength: 3,
        maxLength: 16,
        required: true,
    }),
    ExchangeInputField("Offset", {
        customId: "offset",
        label: "What time is it for you? (for time zone)",
        style: TextInputStyle.Short,
        minLength: 1,
        maxLength: 12,
        required: true,
        placeholder: "e.g. 4:15, 5:30 p.m., 8:00 PM, 19:00, ...",
    }),
]

export async function updateRegistration(user: User, mcUUID: string, offset: number) {
    await UserProfile.updateOne({ _id: user.id }, { mcUUID, offset }, { upsert: true })
}

export async function getInitialState(interaction: CommandHandlerInteraction, state: ExchangeHandlerState) {
    const profile = UserProfile.cache.get(interaction.user.id)
    if (profile && (profile.mcUUID !== undefined || profile.offset !== undefined)) {
        if (profile.mcUUID !== undefined) {
            const mc = await MojangClient.uuidToProfile(profile.mcUUID).catch(console.error)
            if (mc) state.setFieldValue("mc_account", mc?.name, mc)
        }

        if (profile.offset !== undefined) {
            state.setFieldValue(
                "offset",
                DateTime.utc().plus({ minutes: profile.offset }).toFormat("h:mm a"),
                profile.offset,
            )
        }
    }
}

class RegistrationHandler extends ExchangeHandler {
    constructor() {
        super("Register", "Registration", FIELDS)
    }

    /** @override */
    async getInitialState(interaction: CommandHandlerInteraction, state: ExchangeHandlerState) {
        return getInitialState(interaction, state)
    }

    /** @override */
    async getFinishResponse(interaction: RecallExchangeInteraction) {
        const minecraft = interaction.state.getFieldValue("mc_account") as MojangResolvedUser
        const offset = interaction.state.getFieldValue("offset") as number
        await updateRegistration(interaction.user, minecraft.id, offset)
        return new MessageOptionsBuilder().setContent("Registration Updated.")
    }
}

Command(new RegistrationHandler().asCommand())

BotMessage({
    name: "Registration Message",
    builder(builder) {
        return builder
            .addEmbeds(new EmbedBuilder().setColor(Colors.White).setTitle(`Update your registration here!`))
            .addActions(
                new ButtonBuilder()
                    .setCustomId("Register")
                    .setLabel("Register")
                    .setEmoji("📝")
                    .setStyle(ButtonStyle.Primary),
            )
    },
})
