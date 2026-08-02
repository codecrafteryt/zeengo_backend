import { Booking, StaffUser, Task } from '@prisma/client';

export type TaskDto = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  bookingId: string | null;
  znCode: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  status: string;
  completedAt: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

type TaskRow = Task & {
  booking?: Booking | null;
  assignee?: StaffUser | null;
  createdByUser?: StaffUser | null;
};

export function mapTask(row: TaskRow): TaskDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    bookingId: row.bookingId,
    znCode: row.booking?.znCode ?? null,
    assigneeId: row.assigneeId,
    assigneeName: row.assignee?.fullName ?? null,
    dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null,
    status: row.status,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdByName: row.createdByUser?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
