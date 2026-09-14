import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import { ALLOW_ROLES_KEY, RESTRICT_ROLES_KEY } from './roles.decorator';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const user = request.user;

    /*
     * FirebaseAuthGuard should always run before RoleGuard.
     *
     * If there is no authenticated user, reject the request.
     */
    if (!user) {
      throw new ForbiddenException('Authenticated user not found');
    }

    const userRole = user.role;

    /*
     * ==========================================================
     * ALLOW ROLES
     * ==========================================================
     *
     * @AllowRoles('root_manager')
     *
     * or
     *
     * @AllowRoles('root_manager', 'admin')
     *
     * If AllowRoles exists, the user MUST have one
     * of the specified roles.
     */
    const allowedRoles = this.reflector.getAllAndOverride<string[]>(ALLOW_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (allowedRoles?.length) {
      if (!userRole || !allowedRoles.includes(userRole)) {
        throw new ForbiddenException('You are not allowed to access this resource. Contact Support');
      }

      return true;
    }

    /*
     * ==========================================================
     * RESTRICT ROLES
     * ==========================================================
     *
     * @RestrictRoles('root_manager')
     *
     * or
     *
     * @RestrictRoles('root_manager', 'field_executive')
     *
     * If RestrictRoles exists, the user MUST NOT have
     * any of the specified roles.
     */
    const restrictedRoles = this.reflector.getAllAndOverride<string[]>(RESTRICT_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (restrictedRoles?.length) {
      if (userRole && restrictedRoles.includes(userRole)) {
        throw new ForbiddenException('You are not allowed to access this resource. Contact Support');
      }

      return true;
    }

    /*
     * ==========================================================
     * NO ROLE DECORATOR
     * ==========================================================
     *
     * If neither @AllowRoles nor @RestrictRoles is present,
     * authentication alone is enough.
     */
    return true;
  }
}
