import { SetMetadata } from '@nestjs/common';
import { StaffRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const IS_PUBLIC_KEY = 'isPublic';

/** Allow route without JWT */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Staff roles allowed; omit for any authenticated user */
export const Roles = (...roles: Array<StaffRole | 'client'>) =>
  SetMetadata(ROLES_KEY, roles);
