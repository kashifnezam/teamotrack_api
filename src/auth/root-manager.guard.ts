import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class RootManagerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const user = request.user;

    if (user?.role !== 'root_manager') {
      throw new ForbiddenException('You are not allowed to access this resource. Contact Support');
    }

    return true;
  }
}
