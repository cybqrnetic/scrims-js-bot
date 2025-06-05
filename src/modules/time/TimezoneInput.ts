import {
    ActionRowBuilder,
    APITextInputComponent,
    BaseInteraction,
    ContainerBuilder,
    MessageComponentInteraction,
    ModalBuilder,
    ModalSubmitInteraction,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js"

import { Emojis } from "@Constants"
import { ExchangeState, FormComponent, OffsetInput } from "@module/forms"
import { rawTimeZones } from "@vvo/tzdb"
import { codeBlock } from "discord.js"
import { DateTime } from "luxon"

const TIMEZONES = rawTimeZones
const ZONE_COUNTRIES = Object.fromEntries(TIMEZONES.map((zone) => [zone.name, zone.countryCode]))
const ZONE_ALT = Object.fromEntries(TIMEZONES.map((zone) => [zone.name, zone.alternativeName]))
const COUNTRY_CODES = Object.fromEntries(TIMEZONES.map((zone) => [zone.countryCode, zone.countryName.trim()]))
function getOffset(timezone: string) {
    return DateTime.now().setZone(timezone).offset
}

const Selects = {
    Country: "country",
    Timezone: "timezone",
}

export class TimezoneInput implements FormComponent {
    private readonly offset: OffsetInput
    private readonly countryId: string
    private readonly countryInput: APITextInputComponent

    constructor(
        private readonly id: string,
        private readonly required: boolean,
    ) {
        this.offset = OffsetInput.builder()
            .setId(`${id}:offset`)
            .setLabel("Current Time")
            .setRequired(required)
            .build()

        this.countryId = `${id}:country`
        this.countryInput = new TextInputBuilder()
            .setCustomId(this.countryId)
            .setLabel("Country Code (Two Letters)")
            .setPlaceholder("e.g. US, CA, UK")
            .setRequired(this.required)
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(2)
            .toJSON()
    }

    setValue(state: ExchangeState, timezone: string) {
        this.offset.setValue(state, getOffset(timezone))
        state.set(this.countryId, ZONE_COUNTRIES[timezone])
        state.set(this.id, timezone)
    }

    getValue(state: ExchangeState): string | undefined {
        return state.get<string>(this.id)
    }

    /** @override */
    isSubmittable(state: ExchangeState): boolean {
        if (!this.required) return true

        const offset = this.offset.getValue(state)
        const country = state.get<string>(this.countryId)
        const timezone = state.get<string>(this.id)
        return (
            offset !== undefined &&
            country !== undefined &&
            timezone !== undefined &&
            ZONE_COUNTRIES[timezone] === country &&
            getOffset(timezone) === offset
        )
    }

    /** @override */
    getResult(ctx: BaseInteraction<"cached">, state: ExchangeState) {
        const timezone = state.get<string>(this.id)
        return {
            label: "Timezone",
            value: timezone ? codeBlock(ZONE_ALT[timezone]!) : undefined,
        }
    }

    /** @override */
    addMessageComponents(
        ctx: BaseInteraction<"cached">,
        state: ExchangeState,
        container: ContainerBuilder,
        componentId: string,
    ) {
        this.offset.addMessageComponents(ctx, state, container)
        const offset = this.offset.getValue(state)
        if (offset === undefined) return

        const options = TIMEZONES.filter((zone) => getOffset(zone.name) === offset)
        if (options.length === 0) {
            container.addTextDisplayComponents((text) =>
                text.setContent(`-# ${Emojis.x} No timezones found with that time.`),
            )
            return
        }

        const countries = Array.from(new Set(options.map((zone) => zone.countryCode)))
        if (countries.length === 1) {
            state.set(this.countryId, countries[0]!)
        }

        const country = state.get<string>(this.countryId)!
        if (!(country in COUNTRY_CODES)) {
            container.addTextDisplayComponents((text) =>
                text.setContent(`### Country\n${codeBlock(country)}`),
            )
            container.addTextDisplayComponents((text) =>
                text.setContent(`-# ${Emojis.x} Invalid country code.`),
            )

            container.addActionRowComponents(
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`${componentId}/${Selects.Country}`)
                        .setPlaceholder("Select your country")
                        .addOptions(
                            countries
                                .slice(0, 25)
                                .sort()
                                .map((code) => ({ label: `${COUNTRY_CODES[code]} (${code})`, value: code })),
                        ),
                ),
            )

            return
        }

        container.addTextDisplayComponents((text) =>
            text.setContent(`### Country\n${codeBlock(`${COUNTRY_CODES[country]} (${country})`)}`),
        )

        const timezones = options.slice(0, 25).filter((zone) => zone.countryCode === country)
        if (timezones.length === 0) {
            container.addTextDisplayComponents((text) =>
                text.setContent(`-# ${Emojis.x} No timezones found with that time and country.`),
            )
            return
        }

        if (timezones.length === 1) {
            state.set(this.id, timezones[0]!.name)
        }

        container.addTextDisplayComponents((text) => text.setContent(`### Timezone`))

        const timezone = state.get<string>(this.id)
        container.addActionRowComponents(
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`${componentId}/${Selects.Timezone}`)
                    .setPlaceholder("Select your timezone")
                    .addOptions(
                        timezones
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((zone) => ({
                                label: zone.alternativeName,
                                value: zone.name,
                                default: zone.name === timezone,
                            })),
                    ),
            ),
        )
    }

    /** @override */
    addModalComponent(ctx: BaseInteraction<"cached">, state: ExchangeState, modal: ModalBuilder) {
        this.offset.addModalComponent(ctx, state, modal)
        modal.addComponents(
            new ActionRowBuilder({
                components: [{ ...this.countryInput, value: state.get<string>(this.countryId) }],
            }),
        )
    }

    /** @override */
    async handleModal(interaction: ModalSubmitInteraction<"cached">, state: ExchangeState) {
        await this.offset.handleModal(interaction, state)
        state.set(this.countryId, interaction.fields.getTextInputValue(this.countryId).toUpperCase())
    }

    /** @override */
    handleComponent(interaction: MessageComponentInteraction<"cached">, state: ExchangeState) {
        if (interaction.isStringSelectMenu()) {
            switch (interaction.args.shift()!) {
                case Selects.Country:
                    state.set(this.countryId, interaction.values[0]!)
                    break
                case Selects.Timezone:
                    state.set(this.id, interaction.values[0]!)
                    break
            }
        }
    }
}
