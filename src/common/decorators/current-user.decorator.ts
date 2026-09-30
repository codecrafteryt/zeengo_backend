import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { StaffRole } from '@prisma/client';

export type AuthPrincipal = {
  sub: string;
  type: 'staff' | 'client';
  role?: StaffRole;
  /** Client ZN session — which booking this token is bound to. */
  bookingId?: string;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthPrincipal }>();
    return request.user;
  },
);
