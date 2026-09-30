import { AssignmentStatus, Prisma } from '@prisma/client';

/** Assignment still open on a booking (blocks re-assign). */
export const OPEN_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.pending,
  AssignmentStatus.accepted,
  AssignmentStatus.in_progress,
  AssignmentStatus.active,
];

/**
 * Driver may open / receive booking chat for these statuses —
 * includes completed so guest↔driver messaging works after trip start/end.
 */
export const CHAT_DRIVER_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  ...OPEN_ASSIGNMENT_STATUSES,
  AssignmentStatus.completed,
];

/** Driver committed — show guest/ops as assigned. */
export const COMMITTED_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.accepted,
  AssignmentStatus.in_progress,
  AssignmentStatus.active,
];

/** Client app may show driver contact & trip status. */
export const CLIENT_VISIBLE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.accepted,
  AssignmentStatus.in_progress,
  AssignmentStatus.active,
  AssignmentStatus.completed,
];

export function openAssignmentWhere(
  extra?: Prisma.DriverAssignmentWhereInput,
): Prisma.DriverAssignmentWhereInput {
  return {
    status: { in: OPEN_ASSIGNMENT_STATUSES },
    ...extra,
  };
}

export function isOpenAssignmentStatus(status: AssignmentStatus): boolean {
  return OPEN_ASSIGNMENT_STATUSES.includes(status);
}
