import { SlashCommandBuilder } from "discord.js"
import { MessageOptionsBuilder, SlashCommand } from "lib"

import { Colors } from "@Constants"
import { SimpleFormHandler } from "@module/forms"
import { UserProfile } from "@module/profiler"
import { TimezoneInput } from "./TimezoneInput"

const TZ_INPUT = new TimezoneInput("timezone", true)
export const TZ_FORM = SimpleFormHandler.builder("TIMEZONE", "Timezone")
    .setColor(Colors.LightBlue)
    .addPage(TZ_INPUT)
    .onInit(async (interaction, state) => {
        const profile = await UserProfile.findById(interaction.user.id)
        if (profile?.timezone !== undefined) {
            TZ_INPUT.setValue(state, profile.timezone)
        }
    })
    .onFinish(async (interaction, result) => {
        const tz = TZ_INPUT.getValue(result)!
        await UserProfile.updateOne(
            { _id: interaction.user.id },
            { timezone: tz, $unset: { offset: "" } },
            { upsert: true },
        )
        return new MessageOptionsBuilder().setContainerContent("Timezone updated.", Colors.Green)
    })
    .register()

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("timezone")
        .setDescription("Use this command to set your timezone for the /time command."),

    async handler(interaction) {
        await TZ_FORM.start(interaction)
    },
})
