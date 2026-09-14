import { SetMetadata } from '@nestjs/common';

/**
 * Metadata keys used by RoleGuard.
 */
export const ALLOW_ROLES_KEY = 'allow_roles';
export const RESTRICT_ROLES_KEY = 'restrict_roles';

/**
 * Allow only the specified roles to access the resource.
 *
 * Example:
 *
 * @AllowRoles('root_manager')
 *
 * @AllowRoles('root_manager', 'admin')
 */
export const AllowRoles = (...roles: string[]) => SetMetadata(ALLOW_ROLES_KEY, roles);

/**
 * Restrict the specified roles from accessing the resource.
 *
 * Example:
 *
 * @RestrictRoles('root_manager')
 *
 * @RestrictRoles('root_manager', 'field_executive')
 */
export const RestrictRoles = (...roles: string[]) => SetMetadata(RESTRICT_ROLES_KEY, roles);
