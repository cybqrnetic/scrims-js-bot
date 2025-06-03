import { UserProfile } from "@module/profiler"
import {
    ButtonBuilder,
    ButtonStyle,
    SlashCommandBuilder,
    TimestampStyles,
    TimestampStylesString,
    time as formatTime,
} from "discord.js"
import { MessageOptionsBuilder, SlashCommand, TimeUtil, UserError } from "lib"
import { DateTime } from "luxon"
import { TZ_FORM } from "./timezone-form"

const Options = {
    Time: "time",
    Format: "format",
}

SlashCommand({
    builder: new SlashCommandBuilder()
        .setName("time")
        .setDescription("Use this command to send a date/time that adjusts to each person's local time.")
        .addStringOption((o) =>
            o
                .setName(Options.Time)
                .setDescription("The time to show e.g. 5:00 pm, 17:00, today, tmr, 3/25/23, 25.03.2023, ...")
                .setMinLength(1)
                .setMaxLength(30)
                .setRequired(true),
        )
        .addStringOption((o) =>
            o
                .setName(Options.Format)
                .setDescription("Format to show the date/time in")
                .addChoices(
                    { name: "Date & Time (Default)", value: TimestampStyles.LongDateTime },
                    { name: "Only Time (8:00)", value: TimestampStyles.ShortTime },
                    { name: "Relative Time (in ...)", value: TimestampStyles.RelativeTime },
                    { name: "Only Date (3/15/2023)", value: TimestampStyles.ShortDate },
                )
                .setRequired(false),
        ),

    async handler(interaction) {
        const profile = await UserProfile.findOne({ _id: interaction.user.id })
        if (profile?.getOffset() === undefined) {
            return interaction.reply(
                new MessageOptionsBuilder()
                    .setContent(
                        "You have not set your timezone yet. " +
                            "Please use the **`/timezone`** command or the button below to set it.",
                    )
                    .addButtons(
                        new ButtonBuilder()
                            .setCustomId(TZ_FORM.getId())
                            .setLabel("Set Timezone")
                            .setStyle(ButtonStyle.Primary),
                    )
                    .setEphemeral(true),
            )
        }

        const content = [interaction.options.getString(Options.Time, true)] as [string]
        const duration = TimeUtil.parseDuration(content)
        const date = TimeUtil.parseDate(content, profile.getOffset())
        const time = TimeUtil.parseTime(content, profile.getOffset())
        if (!time && !date && !duration)
            throw new UserError(
                "Invalid Date/Time",
                `Valid values would be \`today at 5pm\`, \`tmr at 17:00\`, \`03/25/23 5:00 p.m.\` for example.`,
            )

        let output = DateTime.now()
        if (date)
            output = output.set({ year: date.get("year"), month: date.get("month"), day: date.get("day") })
        if (time) output = output.set({ hour: time.get("hour"), minute: time.get("minute") })
        if (duration) output = output.plus({ seconds: duration })

        if (!output?.isValid)
            throw new UserError(
                "Invalid Date/Time",
                `Valid values would be \`today at 5pm\`, \`tmr at 17:00\`, \`03/25/23 5:00 p.m.\` for example.`,
            )

        const format = interaction.options.getString(Options.Format) ?? TimestampStyles.LongDateTime
        await interaction.reply(formatTime(output.toUnixInteger(), format as TimestampStylesString))
    },
})
