import { StaffRole } from '@prisma/client';
import { OPEN_ASSIGNMENT_STATUSES } from '../drivers/assignment.util';
import { AppError } from './errors/app-error';
import type { AuthPrincipal } from './decorators/current-user.decorator';

type AssignmentLookup = {
  findFirst: (args: unknown) => Promise<{ id: string } | null>;
};

/**
 * Defense-in-depth: drivers may only touch bookings they are openly assigned to.
 * Admin/ops/support are not restricted by this helper.
 */
export async function assertDriverAssignedToBooking(params: {
  user: AuthPrincipal;
  bookingId: string;
  driverAssignments: AssignmentLookup;
}): Promise<void> {
  const { user, bookingId, driverAssignments } = params;
  if (user.type !== 'staff' || user.role !== StaffRole.driver) return;

  const assignment = await driverAssignments.findFirst({
    where: {
      bookingId,
      status: { in: OPEN_ASSIGNMENT_STATUSES },
      driver: { userId: user.sub },
    },
    select: { id: true },
  });

  if (!assignment) throw AppError.forbidden();
}

export function isDriverPrincipal(user: AuthPrincipal): boolean {
  return user.type === 'staff' && user.role === StaffRole.driver;
}
