import { MAIN_GUILD_ID, RANKS } from "@Constants"
import { HostPermissions } from "@module/permissions"
import { OnlinePositions, PositionRole } from "@module/positions"
import { AuditLogEvent, GuildMember } from "discord.js"
import { auditedEvents, AuditedRoleUpdate, BotModule, getMainGuild } from "lib"

const PatronFeaturePositions = PositionRole.declarePositions({
    ColoredRole: "Colored Role",
    TTSPerms: "TTS Perms",
    PristineChatAccess: "Pristine Chat Access",
    PrimeChatAccess: "Prime Chat Access",
    PrivateChatAccess: "Private Chat Access",
    PremiumChatAccess: "Premium Chat Access",
})

export const PatronFeaturePermissions = HostPermissions.declarePermissions({
    ColoredRole: "patron.colored_role",
    TTSPerms: "patron.tts_perms",
    NextChatAccess: "patron.next_chat_access",
    PurgeImmunity: "patron.purge_immunity",
    CustomRole: "patron.custom_role",
    PinMessages: "patron.pin_messages",
    JoinFullCalls: "patron.join_full_calls",
})

const MANUALLY_GIVEN_POSITIONS = new Set(["ColoredRole"])
const ROLE_SYNC_REASON = "Patron Role Sync"

class PatronModule extends BotModule {
    protected addListeners() {
        auditedEvents.on(AuditLogEvent.MemberRoleUpdate, (action) => this.onRolesChange(action))
        HostPermissions.on("update", (user) => this.onPermissionsUpdate(user))
    }

    protected async onInitialized() {
        await this.syncEveryone().catch(console.error)
        setInterval(() => this.syncEveryone().catch(console.error), 20 * 60 * 1000)
    }

    async syncEveryone() {
        await HostPermissions.initialized()
        const guild = getMainGuild()
        if (guild) {
            await Promise.all(
                guild.members.cache.map((user) => this.enforceRoleDependencies(user).catch(console.error)),
            )
        }
    }

    async onRolesChange({ reason, member, guild }: AuditedRoleUpdate) {
        if (guild.id !== MAIN_GUILD_ID || reason === ROLE_SYNC_REASON || !member) return

        await this.enforceRoleDependencies(member)
    }

    async onPermissionsUpdate(user: string) {
        const member = getMainGuild()?.members.cache.get(user)
        if (member) {
            await this.enforceRoleDependencies(member)
        }
    }

    async enforceRoleDependencies(member: GuildMember) {
        if (member.user.bot || member.permissions.has("Administrator")) return

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
        const featureWithPermissionAndPosition = Object.entries(PatronFeaturePermissions).filter(
            ([key]) => key in PatronFeaturePositions,
        )

        for (const [key, slug] of featureWithPermissionAndPosition) {
            const roles = PositionRole.getPermittedRoles(
                PatronFeaturePositions[key as keyof typeof PatronFeaturePositions],
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
                PatronFeaturePositions[(rank + "ChatAccess") as keyof typeof PatronFeaturePositions],
                member.guild.id,
            )

        if (!member.hasPermission(PatronFeaturePermissions.NextChatAccess)) {
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
            if (OnlinePositions.hasPosition(member.user, rank)) {
                break
            }
            nextRank = rank
        }
        return nextRank
    }
}

export default PatronModule.getInstance()
