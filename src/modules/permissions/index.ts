import { events, PermissionEvents } from "./host-permissions"

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
}
