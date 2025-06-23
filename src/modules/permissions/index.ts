import { TicketManager } from "@module/tickets"
import { commands } from "lib"
import { declaredPermissions, events, initialized, PermissionEvents } from "./host-permissions"
import { RolePermissions } from "./RolePermissions"

export { PermissionUpdate } from "./permission-update"
export { RolePermissions } from "./RolePermissions"

export class HostPermissions {
    static on<K extends keyof PermissionEvents>(
        event: K,
        listener: (...args: PermissionEvents[K]) => unknown,
    ) {
        events.on(event, listener)
        return this
    }

    static async initialized() {
        await initialized
    }

    static declarePermissions<T extends string[] | Record<string, string>>(permission: T): T {
        if (Array.isArray(permission)) permission.forEach((pos) => declaredPermissions.add(pos))
        else Object.values(permission).forEach((pos) => declaredPermissions.add(pos))
        return permission
    }

    static declarePermission<T extends string>(permission: T): T {
        declaredPermissions.add(permission)
        return permission
    }

    static getKnownPermissions() {
        return Array.from(
            new Set([
                ...RolePermissions.cache.map((p) => p.permissions).flat(),
                ...declaredPermissions,
                ...commands
                    .getConfigs()
                    .filter((config) => config.permission)
                    .map((config) => config.permission!),
                ...TicketManager.managers.map(({ options }) => options.permission!).filter((p) => p),
            ]),
        )
    }
}
