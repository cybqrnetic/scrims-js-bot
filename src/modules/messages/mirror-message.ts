import { ActionRowBuilder, channelMention, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js"
import { LocalizedSlashCommandBuilder, SlashCommand, UserError } from "lib"

SlashCommand({
    builder: new LocalizedSlashCommandBuilder()
        .setNameAndDescription("commands.mirror")
        .addChannelOption((option) =>
            option.setNameAndDescription("commands.mirror.channel_option").setRequired(false),
        )
        .addBooleanOption((option) =>
            option.setNameAndDescription("commands.mirror.ping_option").setRequired(false),
        )
        .addStringOption((option) =>
            option.setNameAndDescription("commands.mirror.old_messageId_option").setRequired(false),
        )
        .setDefaultMemberPermissions("0"),
    config: { forceGuild: true },

    async handler(interaction) {
        const channelId = interaction.options.getChannel("channel")?.id ?? interaction.channelId
        const pingRoles = !!interaction.options.getBoolean("ping-roles")
        const oldMessageId = interaction.options.getString("old-message-id") ?? ""

        const messageInputField = new TextInputBuilder()
            .setLabel("The Message")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("A properly formatted Discord message.")
            .setCustomId("message")
            .setMinLength(1)
            .setMaxLength(2000)
            .setRequired(true)

        const modal = new ModalBuilder()
            .setTitle("Mirror A Message")
            .setCustomId([interaction.path, channelId, pingRoles, oldMessageId].join("/"))
            .setComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(messageInputField))

        await interaction.showModal(modal)
    },

    async handleModalSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true })

        const channelId = interaction.args.shift()!
        const pingRoles = interaction.args.shift()! === "true"
        const oldMessageId = interaction.args.shift()

        const content = interaction.fields.getField("message").value

        const channel = await interaction.guild?.channels.fetch(channelId)
        if (!channel?.isSendable()) {
            throw new UserError("Invalid Channel", "Please pick a sendable channel and try again!")
        }

        if (oldMessageId) {
            const message = await channel.messages.fetch(oldMessageId)
            if (!message) {
                throw new UserError(
                    "Invalid Message ID",
                    `The message ID provided was not found in ${channelMention(channelId)}.`,
                )
            }

            await message.edit(content)
            return interaction.editReply(`Message Edited! ${message.url}`)
        }

        const message = await channel.send({
            content,
            allowedMentions: { parse: pingRoles ? ["everyone", "roles", "users"] : ["users"] },
        })

        await interaction.editReply(`Message Sent! ${message.url}`)
    },
})
