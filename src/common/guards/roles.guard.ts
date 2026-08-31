import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthPrincipal } from '../decorators/current-user.decorator';
import { AppError } from '../errors/app-error';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Array<StaffRole | 'client'>>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthPrincipal }>();
    const user = request.user;
    if (!user) throw AppError.unauthorized();

    if (user.type === 'client') {
      if (!roles.includes('client')) throw AppError.forbidden();
      return true;
    }

    if (!user.role || !roles.includes(user.role)) {
      throw AppError.forbidden();
    }
    return true;
  }
}
