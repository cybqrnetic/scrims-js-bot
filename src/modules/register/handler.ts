import { ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder, User } from "discord.js"
import { MessageOptionsBuilder, SlashCommand } from "lib"

import { Colors } from "@Constants"
import { IgnInput, SimpleFormHandler } from "@module/forms"
import { BotMessage } from "@module/messages"
import { UserProfile } from "@module/profiler"
import { TimezoneInput } from "./TimezoneInput"

export async function updateRegistration(user: User, mcUUID: string, timezone: string) {
    await UserProfile.updateOne({ _id: user.id }, { mcUUID, timezone }, { upsert: true })
}

const IGN_INPUT = IgnInput.builder().setId("mc").setRequired(true).build()
const TZ_INPUT = new TimezoneInput("timezone", true)

const REGISTER_FORM = SimpleFormHandler.builder("REGISTER", "Registration")
    .setColor(Colors.LightBlue)
    .addPage(IGN_INPUT, TZ_INPUT)
    .onInit(async (interaction, state) => {
        const profile = await UserProfile.findById(interaction.user.id)
        if (profile?.mcUUID !== undefined) {
            await IGN_INPUT.setValueId(state, profile.mcUUID)
        }

        if (profile?.timezone !== undefined) {
            TZ_INPUT.setValue(state, profile.timezone)
        }
    })
    .onFinish(async (interaction, result) => {
        const mc = IGN_INPUT.getValue(result)!
        const tz = TZ_INPUT.getValue(result)!
        await updateRegistration(interaction.user, mc.id, tz)
        return new MessageOptionsBuilder().setContainerContent("Registration Updated.", Colors.Green)
    })
    .register()

BotMessage({
    name: "Registration Message",
    builder() {
        return new MessageOptionsBuilder()
            .addEmbeds(new EmbedBuilder().setColor(Colors.White).setTitle(`Update your registration here!`))
            .addActions(
                new ButtonBuilder()
                    .setCustomId(REGISTER_FORM.getId())
                    .setLabel("Register")
                    .setEmoji("📝")
                    .setStyle(ButtonStyle.Primary),
            )
    },
})

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("register")
        .setDescription("Register your Minecraft username and timezone."),

    async handler(interaction) {
        await REGISTER_FORM.start(interaction)
    },
})
