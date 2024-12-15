import { EmbedBuilder, InteractionContextType, italic } from "discord.js"
import { LocalizedSlashCommandBuilder, MessageOptionsBuilder, SlashCommand } from "lib"

import { Config } from "./Config"

const Options = {
    Key: "key",
    Value: "value",
}

SlashCommand({
    builder: new LocalizedSlashCommandBuilder()
        .setNameAndDescription("commands.config")
        .addStringOption((option) =>
            option
                .setNameAndDescription("commands.config.key_option")
                .setName(Options.Key)
                .setAutocomplete(true)
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setNameAndDescription("commands.config.val_option")
                .setName(Options.Value)
                .setRequired(false),
        )
        .setDefaultMemberPermissions("0")
        .setContexts(InteractionContextType.Guild),

    async handleAutocomplete(interaction) {
        const focused = interaction.options.getFocused()
        await interaction.respond(
            Array.from(new Set(Config.cache.map((v) => v.type).concat(...Config.declaredTypes())))
                .filter((v) => v.toLowerCase().includes(focused.toLowerCase()))
                .sort((a, b) => a.localeCompare(b))
                .map((v) => ({ name: v, value: v }))
                .slice(0, 25),
        )
    },

    async handler(interaction) {
        await interaction.deferReply({ ephemeral: true })

        const type = interaction.options.getString(Options.Key)
        const value = interaction.options.getString(Options.Value)

        if (type === null) {
            const config = Config.cache.filter((v) => v.guildId === interaction.guildId)
            if (!config.length) return interaction.editReply(italic("Nothing to see here."))
            return interaction.editReply(
                new MessageOptionsBuilder().createMultipleEmbeds(
                    config.sort((a, b) => a.type.localeCompare(b.type)),
                    (entries) =>
                        new EmbedBuilder()
                            .setTitle("Guild Configuration")
                            .setColor("#00d8ff")
                            .setDescription(
                                entries.map((v) => `\`•\` **${v.type}:** ${v.parsedValue()}`).join("\n"),
                            ),
                ),
            )
        }

        const selector = { type, guildId: interaction.guildId! }

        if (value === "" || value === "null" || value === "none") {
            const deleted = await Config.findOneAndDelete(selector)
            return interaction.editReply(!deleted ? "*None*" : `:x:  ${deleted.parsedValue()}`)
        }

        const old = Config.cache
            .find((v) => v.type === type && v.guildId === interaction.guildId)
            ?.parsedValue()
        if (value === null) return interaction.editReply(!old ? "*None*" : `:white_check_mark:  ${old}`)

        const created = await Config.findOneAndUpdate(selector, { value }, { upsert: true, new: true })
        await interaction.editReply(
            old
                ? `:twisted_rightwards_arrows:  ${old} **->** ${created!.parsedValue()}`
                : `:white_check_mark: ${created!.parsedValue()}`,
        )
    },
})
