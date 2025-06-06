export interface PermissionUpdate {
    added(permission: string): boolean
    removed(permission: string): boolean
}

export class AllPermissionsRemovedUpdate implements PermissionUpdate {
    added(_permission: string): boolean {
        return false
    }

    removed(_permission: string): boolean {
        return true
    }
}

export class AllPermissionsAddedUpdate implements PermissionUpdate {
    added(_permission: string): boolean {
        return true
    }

    removed(_permission: string): boolean {
        return false
    }
}

export class FreshPermissionsUpdate implements PermissionUpdate {
    constructor(private readonly permissions: Set<string>) {}

    added(permission: string): boolean {
        return this.permissions.has(permission)
    }

    removed(_permission: string): boolean {
        return false
    }
}

export class PermissionsLostUpdate implements PermissionUpdate {
    constructor(private readonly permissions: Set<string>) {}

    added(_permission: string): boolean {
        return false
    }

    removed(permission: string): boolean {
        return !this.permissions.has(permission)
    }
}

export class PermissionsGainedUpdate implements PermissionUpdate {
    constructor(private readonly previous: Set<string>) {}

    added(permission: string): boolean {
        return !this.previous.has(permission)
    }

    removed(_permission: string): boolean {
        return false
    }
}

export class DiffPermissionsUpdate implements PermissionUpdate {
    constructor(
        private readonly previous: Set<string>,
        private readonly updated: Set<string>,
    ) {}

    added(permission: string): boolean {
        return !this.previous.has(permission) && this.updated.has(permission)
    }

    removed(permission: string): boolean {
        return this.previous.has(permission) && !this.updated.has(permission)
    }
}
