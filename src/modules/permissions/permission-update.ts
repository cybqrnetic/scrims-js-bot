import { Permissions } from "./host-permissions"

export interface PermissionUpdate {
    added(permission: string): boolean
    removed(permission: string): boolean
    /** true if admin gained and false if admin lost otherwise undefined */
    admined(): boolean | undefined
}

export class AdminToNoneUpdate implements PermissionUpdate {
    added(_permission: string): boolean {
        return false
    }

    removed(_permission: string): boolean {
        return true
    }

    admined(): boolean | undefined {
        return false
    }
}

export class PermsToNoneUpdate implements PermissionUpdate {
    constructor(private readonly previous: Permissions) {}

    added(_permission: string): boolean {
        return false
    }

    removed(permission: string): boolean {
        return this.previous.has(permission)
    }

    admined(): boolean | undefined {
        return undefined
    }
}

export class NoneToAdminUpdate implements PermissionUpdate {
    added(_permission: string): boolean {
        return true
    }

    removed(_permission: string): boolean {
        return false
    }

    admined(): boolean | undefined {
        return true
    }
}

export class NoneToPermsUpdate implements PermissionUpdate {
    constructor(private readonly permissions: Permissions) {}

    added(permission: string): boolean {
        return this.permissions.has(permission)
    }

    removed(_permission: string): boolean {
        return false
    }

    admined(): boolean | undefined {
        return undefined
    }
}

export class AdminToPermsUpdate implements PermissionUpdate {
    constructor(private readonly permissions: Permissions) {}

    added(_permission: string): boolean {
        return false
    }

    removed(permission: string): boolean {
        return !this.permissions.has(permission)
    }

    admined(): boolean | undefined {
        return false
    }
}

export class PermsToAdminUpdate implements PermissionUpdate {
    constructor(private readonly previous: Permissions) {}

    added(permission: string): boolean {
        return !this.previous.has(permission)
    }

    removed(_permission: string): boolean {
        return false
    }

    admined(): boolean | undefined {
        return true
    }
}

export class DiffPermissionsUpdate implements PermissionUpdate {
    constructor(
        private readonly previous: Permissions,
        private readonly updated: Permissions,
    ) {}

    added(permission: string): boolean {
        return !this.previous.has(permission) && this.updated.has(permission)
    }

    removed(permission: string): boolean {
        return this.previous.has(permission) && !this.updated.has(permission)
    }

    admined(): boolean | undefined {
        return undefined
    }
}
