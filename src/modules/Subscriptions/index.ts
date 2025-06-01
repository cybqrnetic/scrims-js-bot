import { MAIN_GUILD_ID, RANKS } from "@Constants"
import { membersFetched } from "@module/member-fetcher"
import { PositionRole } from "@module/positions"
import { AuditLogEvent, Events, GuildMember } from "discord.js"
import { auditedEvents, AuditedRoleUpdate, BotModule, getMainGuild } from "lib"

const SubscriptionFeaturePositions = PositionRole.declarePositions({
    ColoredRole: "Colored Role",
    TTSPerms: "TTS Perms",
    PristineChatAccess: "Pristine Chat Access",
    PrimeChatAccess: "Prime Chat Access",
    PrivateChatAccess: "Private Chat Access",
    PremiumChatAccess: "Premium Chat Access",
})

export const SubscriptionFeaturePermissions = {
    ColoredRole: "subscription.colored_role",
    TTSPerms: "subscription.tts_perms",
    NextChatAccess: "subscription.next_chat_access",
    PurgeImmunity: "subscription.purge_immunity",
}

const MANUALLY_GIVEN_POSITIONS = new Set(["ColoredRole"])
const ROLE_SYNC_REASON = "Subscription Role Sync"

class SubscriptionModule extends BotModule {
    protected addListeners() {
        auditedEvents.on(AuditLogEvent.MemberRoleUpdate, (action) => this.onRolesChange(action))
        this.bot.on(Events.GuildMemberAdd, (member) => this.enforceRoleDependencies(member))
    }

    async onInitialized() {
        await this.syncEveryone().catch(console.error)
        setInterval(() => this.syncEveryone().catch(console.error), 20 * 60 * 1000)
    }

    async syncEveryone() {
        await membersFetched()
        const guild = getMainGuild()
        if (guild) {
            await Promise.all(
                guild.members.cache.map((user) => this.enforceRoleDependencies(user).catch(console.error)),
            )
        }
    }

    async onRolesChange({ reason, member }: AuditedRoleUpdate) {
        if (reason === ROLE_SYNC_REASON || !member) return

        await this.enforceRoleDependencies(member)
    }

    async enforceRoleDependencies(member: GuildMember) {
        if (member.guild.id !== MAIN_GUILD_ID) return

        const rolesToGive = new Set<string>()
        const rolesToRemove = new Set<string>()

        this.syncRolesByPermissions(member, rolesToGive, rolesToRemove)
        this.syncRolesByNextChatAccess(member, rolesToGive, rolesToRemove)

        await Promise.all([
            ...Array.from(rolesToGive).map((roleId) =>
                member.roles.add(roleId, ROLE_SYNC_REASON).catch(console.error),
            ),
            ...Array.from(rolesToRemove).map((roleId) =>
                member.roles.remove(roleId, ROLE_SYNC_REASON).catch(console.error),
            ),
        ])
    }

    private syncRolesByPermissions(
        member: GuildMember,
        rolesToGive: Set<string>,
        rolesToRemove: Set<string>,
    ) {
        const featureWithPermissionAndPosition = Object.entries(SubscriptionFeaturePermissions).filter(
            ([key]) => key in SubscriptionFeaturePositions,
        )

        for (const [key, slug] of featureWithPermissionAndPosition) {
            const roles = PositionRole.getPermittedRoles(
                SubscriptionFeaturePositions[key as keyof typeof SubscriptionFeaturePositions],
                member.guild.id,
            )

            if (member.hasPermission(slug)) {
                if (MANUALLY_GIVEN_POSITIONS.has(key)) continue

                roles.forEach(({ id }) => {
                    if (!member.roles.cache.has(id)) {
                        rolesToGive.add(id)
                    }
                })
            } else {
                roles.forEach(({ id }) => {
                    if (member.roles.cache.has(id)) {
                        rolesToRemove.add(id)
                    }
                })
            }
        }
    }

    private syncRolesByNextChatAccess(
        member: GuildMember,
        rolesToGive: Set<string>,
        rolesToRemove: Set<string>,
    ) {
        const getRoles = (rank: string) =>
            PositionRole.getPermittedRoles(
                SubscriptionFeaturePositions[
                    (rank + "ChatAccess") as keyof typeof SubscriptionFeaturePositions
                ],
                member.guild.id,
            )

        if (!member.hasPermission(SubscriptionFeaturePermissions.NextChatAccess)) {
            for (const rank of Object.values(RANKS)) {
                const roles = getRoles(rank)
                roles.forEach(({ id }) => {
                    if (member.roles.cache.has(id)) {
                        rolesToRemove.add(id)
                    }
                })
            }
            return
        }

        const nextRank = this.getNextMemberRank(member)
        if (nextRank) {
            const nextRoles = getRoles(nextRank)
            nextRoles.forEach(({ id }) => {
                if (!member.roles.cache.has(id)) {
                    rolesToGive.add(id)
                }
            })
        }

        const otherRanks = Object.values(RANKS).filter((rank) => rank !== nextRank)
        for (const rank of otherRanks) {
            const roles = getRoles(rank)
            roles.forEach(({ id }) => {
                if (member.roles.cache.has(id)) {
                    rolesToRemove.add(id)
                }
            })
        }
    }

    private getNextMemberRank(member: GuildMember) {
        let nextRank
        for (const rank of Object.values(RANKS).reverse()) {
            const roles = PositionRole.getPositionRoles(rank, member.guild.id)
            if (roles.some((r) => member.roles.cache.has(r.roleId))) {
                break
            }
            nextRank = rank
        }
        return nextRank
    }
}

export default SubscriptionModule.getInstance()
