import { Injectable } from '@nestjs/common';
import { Prisma, StaffRole, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { NotificationsService } from '../notifications/notifications.service';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import {
  pageMeta,
  parseSort,
  toSkipTake,
} from '../common/pagination/pagination';
import {
  CreateTaskDto,
  ListTasksQuery,
  UpdateTaskDto,
} from './tasks.schema';
import { mapTask } from './tasks.mapper';

const TASK_READ_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
];

const TASK_WRITE_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
];

const taskInclude = {
  booking: true,
  assignee: true,
  createdByUser: true,
} satisfies Prisma.TaskInclude;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEmitter,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: ListTasksQuery, user: AuthPrincipal) {
    this.assertStaffRead(user);
    const { page, limit, skip, take } = toSkipTake(query);

    const where: Prisma.TaskWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }
    if (query.priority) {
      where.priority = query.priority;
    }
    if (query.assignee === 'me') {
      where.assigneeId = user.sub;
    }
    if (query.bookingId) {
      where.bookingId = query.bookingId;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    const orderBy = parseSort(
      query.sort,
      ['createdAt', 'dueDate', 'priority', 'status'],
      { field: 'createdAt', dir: 'desc' },
    );

    const [rows, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy,
        skip,
        take,
        include: taskInclude,
      }),
      this.prisma.task.count({ where }),
    ]);

    return { data: rows.map(mapTask), meta: pageMeta(total, page, limit) };
  }

  async create(dto: CreateTaskDto, user: AuthPrincipal) {
    this.assertStaffWrite(user);

    if (dto.bookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: dto.bookingId },
      });
      if (!booking) {
        throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
      }
    }

    if (dto.assigneeId) {
      const assignee = await this.prisma.staffUser.findFirst({
        where: { id: dto.assigneeId, deletedAt: null, isActive: true },
      });
      if (!assignee) {
        throw AppError.notFound('ASSIGNEE_NOT_FOUND', 'Assignee not found');
      }
    }

    const row = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        bookingId: dto.bookingId,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        createdBy: user.sub,
      },
      include: taskInclude,
    });

    const created = mapTask(row);
    this.realtime.emit('task.updated', created);

    if (row.bookingId && row.booking) {
      await this.notifications.notifyBookingClient(row.bookingId, {
        type: 'task',
        title: `New update: ${row.title}`,
        body: row.description ?? `Ops added a task for your trip ${row.booking.znCode}.`,
        data: {
          taskId: row.id,
          priority: row.priority,
          status: row.status,
          event: 'task.created',
        },
      });
    }

    return created;
  }

  async update(id: string, dto: UpdateTaskDto, user: AuthPrincipal) {
    this.assertStaffWrite(user);
    await this.ensureTask(id);

    if (dto.bookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: dto.bookingId },
      });
      if (!booking) {
        throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
      }
    }

    if (dto.assigneeId) {
      const assignee = await this.prisma.staffUser.findFirst({
        where: { id: dto.assigneeId, deletedAt: null, isActive: true },
      });
      if (!assignee) {
        throw AppError.notFound('ASSIGNEE_NOT_FOUND', 'Assignee not found');
      }
    }

    const completedAt =
      dto.status === TaskStatus.done
        ? new Date()
        : dto.status === TaskStatus.open
          ? null
          : undefined;

    const row = await this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        bookingId: dto.bookingId,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status,
        completedAt,
      },
      include: taskInclude,
    });

    const updated = mapTask(row);
    this.realtime.emit('task.updated', updated);
    return updated;
  }

  async complete(id: string, user: AuthPrincipal) {
    this.assertStaffRead(user);
    const task = await this.ensureTask(id);

    if (
      user.role !== StaffRole.admin &&
      user.role !== StaffRole.ops_manager &&
      task.assigneeId !== user.sub
    ) {
      throw AppError.forbidden();
    }

    const row = await this.prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.done,
        completedAt: new Date(),
      },
      include: taskInclude,
    });

    const completed = mapTask(row);
    this.realtime.emit('task.updated', completed);
    return completed;
  }

  private async ensureTask(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw AppError.notFound('TASK_NOT_FOUND', 'Task not found');
    }
    return task;
  }

  private assertStaffRead(user: AuthPrincipal) {
    if (
      user.type !== 'staff' ||
      !user.role ||
      !TASK_READ_ROLES.includes(user.role)
    ) {
      throw AppError.forbidden();
    }
  }

  private assertStaffWrite(user: AuthPrincipal) {
    if (
      user.type !== 'staff' ||
      !user.role ||
      !TASK_WRITE_ROLES.includes(user.role)
    ) {
      throw AppError.forbidden();
    }
  }
}
