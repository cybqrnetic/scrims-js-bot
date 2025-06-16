import { declaredPermissions, events, initialized, PermissionEvents } from "./host-permissions"

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

    static get declaredPermissions() {
        return declaredPermissions
    }
}
