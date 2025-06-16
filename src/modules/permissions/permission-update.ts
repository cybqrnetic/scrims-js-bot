import { Permission } from "./host-permissions"

export interface PermissionUpdate {
    added(permission: Permission): boolean
    removed(permission: Permission): boolean
    /** true if admin gained and false if admin lost otherwise undefined */
    admined(): boolean | undefined
}

export class AdminToNoneUpdate implements PermissionUpdate {
    added(_permission: Permission): boolean {
        return false
    }

    removed(_permission: Permission): boolean {
        return true
    }

    admined(): boolean | undefined {
        return false
    }
}

export class PermsToNoneUpdate implements PermissionUpdate {
    constructor(private readonly previous: Set<Permission>) {}

    added(_permission: Permission): boolean {
        return false
    }

    removed(permission: Permission): boolean {
        return this.previous.has(permission)
    }

    admined(): boolean | undefined {
        return undefined
    }
}

export class NoneToAdminUpdate implements PermissionUpdate {
    added(_permission: Permission): boolean {
        return true
    }

    removed(_permission: Permission): boolean {
        return false
    }

    admined(): boolean | undefined {
        return true
    }
}

export class NoneToPermsUpdate implements PermissionUpdate {
    constructor(private readonly permissions: Set<Permission>) {}

    added(permission: Permission): boolean {
        return this.permissions.has(permission)
    }

    removed(_permission: Permission): boolean {
        return false
    }

    admined(): boolean | undefined {
        return undefined
    }
}

export class AdminToPermsUpdate implements PermissionUpdate {
    constructor(private readonly permissions: Set<Permission>) {}

    added(_permission: Permission): boolean {
        return false
    }

    removed(permission: Permission): boolean {
        return !this.permissions.has(permission)
    }

    admined(): boolean | undefined {
        return false
    }
}

export class PermsToAdminUpdate implements PermissionUpdate {
    constructor(private readonly previous: Set<Permission>) {}

    added(permission: Permission): boolean {
        return !this.previous.has(permission)
    }

    removed(_permission: Permission): boolean {
        return false
    }

    admined(): boolean | undefined {
        return true
    }
}

export class DiffPermissionsUpdate implements PermissionUpdate {
    constructor(
        private readonly previous: Set<Permission>,
        private readonly updated: Set<Permission>,
    ) {}

    added(permission: Permission): boolean {
        return !this.previous.has(permission) && this.updated.has(permission)
    }

    removed(permission: Permission): boolean {
        return this.previous.has(permission) && !this.updated.has(permission)
    }

    admined(): boolean | undefined {
        return undefined
    }
}
