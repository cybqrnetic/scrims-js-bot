import {
    ActionRowBuilder,
    BaseInteraction,
    ContainerBuilder,
    MessageComponentInteraction,
    ModalBuilder,
    ModalSubmitInteraction,
    StringSelectMenuBuilder,
} from "discord.js"

import { Emojis } from "@Constants"
import { ExchangeState, FormComponent, OffsetInput } from "@module/forms"
import { rawTimeZones } from "@vvo/tzdb"
import { DateTime } from "luxon"

const TIMEZONES = rawTimeZones
const ZONE_COUNTRIES = Object.fromEntries(TIMEZONES.map((zone) => [zone.name, zone.countryName]))
const ZONE_ALT = Object.fromEntries(TIMEZONES.map((zone) => [zone.name, zone.alternativeName]))
function getOffset(timezone: string) {
    return DateTime.now().setZone(timezone).offset
}

const Selects = {
    Country: "country",
    Timezone: "timezone",
}

export class TimezoneInput implements FormComponent {
    private readonly offsetId: string
    private readonly countryId: string
    private readonly offset: OffsetInput

    constructor(
        private readonly id: string,
        private readonly required: boolean,
    ) {
        this.offsetId = `${id}:offset`
        this.countryId = `${id}:country`
        this.offset = OffsetInput.builder()
            .setId(this.offsetId)
            .setLabel("Current Time")
            .setRequired(required)
            .build()
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
            value: timezone ? ZONE_ALT[timezone] : undefined,
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

        const country = state.get<string>(this.countryId)
        container.addActionRowComponents(
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`${componentId}/${Selects.Country}`)
                    .setPlaceholder("Select your country")
                    .addOptions(
                        Array.from(new Set(options.map((zone) => zone.countryName)))
                            .slice(0, 25)
                            .sort()
                            .map((v) => ({ label: v, value: v, default: v === country })),
                    ),
            ),
        )

        if (country !== undefined) {
            const timezones = options.slice(0, 25).filter((zone) => zone.countryName === country)
            if (timezones.length === 1) {
                state.set(this.id, timezones[0]!.name)
            }

            const timezone = state.get<string>(this.id)
            container.addActionRowComponents(
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`${componentId}/${Selects.Timezone}`)
                        .setPlaceholder("Select your timezone")
                        .addOptions(
                            (timezones.length === 0 ? options.slice(0, 25) : timezones)
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
    }

    /** @override */
    addModalComponent(ctx: BaseInteraction<"cached">, state: ExchangeState, modal: ModalBuilder) {
        this.offset.addModalComponent(ctx, state, modal)
    }

    /** @override */
    async handleModal(interaction: ModalSubmitInteraction<"cached">, state: ExchangeState) {
        await this.offset.handleModal(interaction, state)
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
