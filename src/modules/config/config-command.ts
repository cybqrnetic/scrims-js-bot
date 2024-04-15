import { EmbedBuilder, userMention } from "discord.js"
import { Command, Config, LocalizedSlashCommandBuilder, MessageOptionsBuilder } from "lib"

import { Positions } from "@Constants"

const Options = {
    Key: "key",
    Value: "value",
    Client: "client",
}

Command({
    builder: new LocalizedSlashCommandBuilder()
        .setNameAndDescription("commands.config")
        .addStringOption((option) =>
            option
                .setNameAndDescription("commands.config.key_option")
                .setName(Options.Key)
                .setAutocomplete(true)
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setNameAndDescription("commands.config.val_option")
                .setName(Options.Value)
                .setRequired(false),
        )
        .addUserOption((option) =>
            option
                .setNameAndDescription("commands.config.client_option")
                .setName(Options.Client)
                .setRequired(false),
        )
        .setDefaultMemberPermissions("0")
        .setDMPermission(false),

    config: { permissions: { positionLevel: Positions.Staff } },

    async handleAutocomplete(interaction) {
        const focused = interaction.options.getFocused()
        await interaction.respond(
            ["Read All"]
                .concat(...new Set(Config.cache.map((v) => v.type).concat(...Config.declaredTypes())))
                .filter((v) => v.toLowerCase().includes(focused.toLowerCase()))
                .sort((a, b) => a.localeCompare(b))
                .map((v) => ({ name: v, value: v }))
                .slice(0, 25),
        )
    },

    async handler(interaction) {
        await interaction.deferReply({ ephemeral: true })

        const type = interaction.options.getString(Options.Key, true)
        const value = interaction.options.getString(Options.Value)
        const clientId = interaction.options.getUser(Options.Client)?.id

        const clientSelector = !clientId ? { clientId: { $exists: false } } : { clientId }
        const selector = { type, guildId: interaction.guildId!, ...clientSelector }

        if (type === "Read All") {
            const guildConfig = Config.cache.filter((v) => v.guildId === interaction.guildId)
            if (!guildConfig.length) return interaction.editReply("*Nothing to see here.*")
            return interaction.editReply(
                new MessageOptionsBuilder().createMultipleEmbeds(
                    guildConfig.sort((a, b) => a.type.localeCompare(b.type)),
                    (entries) =>
                        new EmbedBuilder()
                            .setTitle("Guild Configuration")
                            .setColor("#00d8ff")
                            .setDescription(
                                entries
                                    .map(
                                        (v) =>
                                            `\`•\` **${v.type}:** ${v.parsedValue()}` +
                                            (v.clientId ? ` (${userMention(v.clientId)})` : ""),
                                    )
                                    .join("\n"),
                            ),
                ),
            )
        }

        if (value === "" || value === "null") {
            const deleted = await Config.findOneAndDelete(selector)
            return interaction.editReply(!deleted ? "*None*" : `:x:  ${deleted.parsedValue()}`)
        }

        const old = Config.cache
            .find((v) => v.type === type && v.guildId === interaction.guildId && v.clientId === clientId)
            ?.parsedValue()
        if (value === null) return interaction.editReply(!old ? "*None*" : `:white_check_mark:  ${old}`)

        const created = await Config.findOneAndUpdate(
            selector,
            { value, ...(!clientId ? { $unset: { clientId: "" } } : { clientId }) },
            { upsert: true, new: true },
        )
        await interaction.editReply(
            old
                ? `:twisted_rightwards_arrows:  ${old} **->** ${created!.parsedValue()}`
                : `:white_check_mark: ${created!.parsedValue()}`,
        )
    },
})
