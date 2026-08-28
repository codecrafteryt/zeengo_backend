import { Injectable } from '@nestjs/common';
import {
  AssignmentStatus,
  BookingStatus,
  ConversationType,
  ParticipantType,
  Prisma,
  SenderType,
  StaffRole,
} from '@prisma/client';
import { OPEN_ASSIGNMENT_STATUSES } from '../drivers/assignment.util';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { JobsService } from '../jobs/jobs.service';
import {
  CreateConversationDto,
  CreateMessageDto,
  ListMessagesQuery,
  MarkReadDto,
} from './chat.schema';
import {
  detectSourceLang,
  mapConversation,
  mapMessage,
} from './chat.mapper';

const CHAT_STAFF_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.splizer,
  StaffRole.driver,
];

const OPS_JOIN_ROLES: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
];

const messageInclude = {
  senderStaff: true,
  senderClient: true,
} satisfies Prisma.MessageInclude;

const conversationInclude = {
  messages: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  booking: { include: { client: true } },
  participants: { include: { client: true, staff: true } },
} satisfies Prisma.ConversationInclude;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEmitter,
    private readonly jobs: JobsService,
  ) {}

  async listConversations(user: AuthPrincipal) {
    if (user.type === 'staff') {
      await this.ensureOpsChannels(user);
    }

    const participantKey = this.participantKey(user);
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { participantKey },
      include: {
        conversation: { include: conversationInclude },
      },
      orderBy: { createdAt: 'desc' },
    });

    const results = await Promise.all(
      participants.map(async (p) => {
        const unread = await this.countUnread(
          p.conversationId,
          p.lastReadMessageId,
          user,
        );
        const lastMsg = p.conversation.messages[0];
        return mapConversation(
          p.conversation,
          unread,
          lastMsg?.createdAt.toISOString() ?? null,
        );
      }),
    );

    return results.sort((a, b) => {
      const aAt = a.lastMessageAt ?? a.createdAt;
      const bAt = b.lastMessageAt ?? b.createdAt;
      return new Date(bAt).getTime() - new Date(aAt).getTime();
    });
  }

  async createConversation(dto: CreateConversationDto, user: AuthPrincipal) {
    this.assertCreateAcl(dto, user);

    if (dto.type === ConversationType.booking_support && dto.bookingId) {
      return this.getOrCreateBookingSupport(dto.bookingId, user, dto.title);
    }

    if (dto.type === ConversationType.dm) {
      return this.createDm(dto, user);
    }

    const participantIds = dto.participantIds ?? [];

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.bookingId) {
        await this.assertBookingAccessTx(tx, dto.bookingId, user);
      }

      const conversation = await tx.conversation.create({
        data: {
          type: dto.type,
          bookingId: dto.bookingId,
          title: dto.title,
        },
      });

      const keys = new Set<string>();
      keys.add(this.participantKey(user));

      for (const id of participantIds) {
        if (id === user.sub) continue;
        const staff = await tx.staffUser.findFirst({
          where: { id, deletedAt: null, isActive: true },
        });
        if (staff) {
          keys.add(`staff:${id}`);
          continue;
        }
        const client = await tx.client.findFirst({
          where: { id, deletedAt: null },
        });
        if (client) {
          keys.add(`client:${id}`);
        }
      }

      if (dto.type === ConversationType.team) {
        const staff = await tx.staffUser.findMany({
          where: { deletedAt: null, isActive: true },
          select: { id: true },
        });
        for (const s of staff) keys.add(`staff:${s.id}`);
      }

      await tx.conversationParticipant.createMany({
        data: [...keys].map((key) => this.participantCreateData(conversation.id, key)),
        skipDuplicates: true,
      });

      return tx.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
        include: conversationInclude,
      });
    });

    return mapConversation(row);
  }

  /** Open or create the booking support thread (Ops/Support/Driver ↔ Client). */
  async getOrCreateBookingSupport(
    bookingId: string,
    user: AuthPrincipal,
    title?: string,
  ) {
    await this.assertBookingAccess(bookingId, user);

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        client: true,
        driverAssignments: {
          where: { status: { in: OPEN_ASSIGNMENT_STATUSES } },
          include: { driver: true },
          take: 1,
        },
      },
    });
    if (!booking) throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');

    let conversation = await this.prisma.conversation.findFirst({
      where: { bookingId, type: ConversationType.booking_support },
      include: conversationInclude,
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          type: ConversationType.booking_support,
          bookingId,
          title:
            title?.trim() ||
            `${booking.znCode} Support — ${booking.client.fullName}`,
        },
        include: conversationInclude,
      });
    }

    const keys = new Set<string>();
    keys.add(`client:${booking.clientId}`);
    keys.add(this.participantKey(user));

    const opsStaff = await this.prisma.staffUser.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        role: { in: OPS_JOIN_ROLES },
      },
      select: { id: true },
    });
    for (const s of opsStaff) keys.add(`staff:${s.id}`);

    const driverUserId = booking.driverAssignments[0]?.driver.userId;
    if (driverUserId) keys.add(`staff:${driverUserId}`);

    await this.prisma.conversationParticipant.createMany({
      data: [...keys].map((key) => this.participantCreateData(conversation!.id, key)),
      skipDuplicates: true,
    });

    const refreshed = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: conversationInclude,
    });

    const participant = await this.prisma.conversationParticipant.findFirst({
      where: {
        conversationId: conversation.id,
        participantKey: this.participantKey(user),
      },
    });
    const unread = participant
      ? await this.countUnread(conversation.id, participant.lastReadMessageId, user)
      : 0;

    return mapConversation(
      refreshed,
      unread,
      refreshed.messages[0]?.createdAt.toISOString() ?? null,
    );
  }

  async listMessages(
    conversationId: string,
    query: ListMessagesQuery,
    user: AuthPrincipal,
  ) {
    await this.ensureParticipant(conversationId, user);

    const where: Prisma.MessageWhereInput = { conversationId };
    if (query.before) {
      const cursor = await this.prisma.message.findUnique({
        where: { id: query.before },
      });
      if (cursor) {
        where.createdAt = { lt: cursor.createdAt };
      }
    }

    const rows = await this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      include: messageInclude,
    });

    return rows.reverse().map(mapMessage);
  }

  async createMessage(
    conversationId: string,
    dto: CreateMessageDto,
    user: AuthPrincipal,
  ) {
    await this.ensureParticipant(conversationId, user);

    const sourceLang = detectSourceLang(dto.body);
    const senderType = user.type === 'staff' ? SenderType.staff : SenderType.client;

    const row = await this.prisma.message.create({
      data: {
        conversationId,
        senderType,
        senderStaffId: user.type === 'staff' ? user.sub : null,
        senderClientId: user.type === 'client' ? user.sub : null,
        body: dto.body,
        sourceLang,
        attachments: (dto.attachments ?? []) as object,
      },
      include: messageInclude,
    });

    const payload = mapMessage(row);
    const rooms = await this.participantRooms(conversationId);
    rooms.push(`conversation:${conversationId}`);
    this.realtime.emit('message.new', payload, rooms);

    void this.jobs.enqueueTranslation(row.id, dto.body, sourceLang);

    return payload;
  }

  async markRead(conversationId: string, dto: MarkReadDto, user: AuthPrincipal) {
    const participant = await this.ensureParticipant(conversationId, user);

    await this.prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadMessageId: dto.lastMessageId },
    });

    const rooms = await this.participantRooms(conversationId);
    rooms.push(`conversation:${conversationId}`);
    this.realtime.emit(
      'message.read',
      {
        conversationId,
        lastMessageId: dto.lastMessageId,
        readerType: user.type,
        readerId: user.sub,
      },
      rooms,
    );

    return { read: true };
  }

  async listClientThreads(user: AuthPrincipal) {
    if (user.type !== 'staff' || !user.role || !CHAT_STAFF_ROLES.includes(user.role)) {
      throw AppError.forbidden();
    }

    await this.ensureOpsChannels(user);

    let bookingIds: string[] | undefined;

    if (user.role === StaffRole.splizer) {
      const bookings = await this.prisma.booking.findMany({
        where: { status: BookingStatus.active },
        select: { id: true },
      });
      bookingIds = bookings.map((b) => b.id);
    } else if (user.role === StaffRole.driver) {
      const assignments = await this.prisma.driverAssignment.findMany({
        where: { driver: { userId: user.sub }, status: { in: OPEN_ASSIGNMENT_STATUSES } },
        select: { bookingId: true },
      });
      bookingIds = assignments.map((a) => a.bookingId);
    }

    const where: Prisma.ConversationWhereInput = {
      type: { in: [ConversationType.booking_support, ConversationType.client_direct] },
    };
    if (bookingIds) {
      where.bookingId = { in: bookingIds };
    }

    const rows = await this.prisma.conversation.findMany({
      where,
      include: conversationInclude,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => {
      const mapped = mapConversation(
        row,
        0,
        row.messages[0]?.createdAt.toISOString() ?? null,
      );
      return {
        ...mapped,
        clientName: mapped.clientName,
        znCode: mapped.znCode,
      };
    });
  }

  /** Used by websocket gateway before joining a conversation room. */
  async assertCanJoinConversation(conversationId: string, user: AuthPrincipal) {
    await this.ensureParticipant(conversationId, user);
    return true;
  }

  private async createDm(dto: CreateConversationDto, user: AuthPrincipal) {
    if (user.type !== 'staff') {
      throw AppError.forbidden('Only staff can start DMs');
    }
    const otherIds = (dto.participantIds ?? []).filter((id) => id !== user.sub);
    if (otherIds.length !== 1) {
      throw AppError.validation('DM requires exactly one other participant');
    }
    const otherId = otherIds[0];

    const otherStaff = await this.prisma.staffUser.findFirst({
      where: { id: otherId, deletedAt: null, isActive: true },
    });
    const otherClient = otherStaff
      ? null
      : await this.prisma.client.findFirst({ where: { id: otherId, deletedAt: null } });
    if (!otherStaff && !otherClient) {
      throw AppError.notFound('PARTICIPANT_NOT_FOUND', 'Participant not found');
    }

    const myKey = `staff:${user.sub}`;
    const otherKey = otherStaff ? `staff:${otherId}` : `client:${otherId}`;

    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: ConversationType.dm,
        AND: [
          { participants: { some: { participantKey: myKey } } },
          { participants: { some: { participantKey: otherKey } } },
        ],
      },
      include: conversationInclude,
    });
    if (existing) {
      return mapConversation(existing);
    }

    const title =
      dto.title?.trim() ||
      (otherStaff ? `DM — ${otherStaff.fullName}` : `DM — ${otherClient!.fullName}`);

    const created = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: { type: ConversationType.dm, title },
      });
      await tx.conversationParticipant.createMany({
        data: [
          this.participantCreateData(conversation.id, myKey),
          this.participantCreateData(conversation.id, otherKey),
        ],
        skipDuplicates: true,
      });
      return tx.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
        include: conversationInclude,
      });
    });

    return mapConversation(created);
  }

  private assertCreateAcl(dto: CreateConversationDto, user: AuthPrincipal) {
    if (user.type === 'client') {
      if (
        dto.type !== ConversationType.booking_support &&
        dto.type !== ConversationType.client_direct
      ) {
        throw AppError.forbidden('Clients cannot create this conversation type');
      }
      if (!dto.bookingId) {
        throw AppError.validation('bookingId is required');
      }
      return;
    }

    if (dto.type === ConversationType.team && user.role === StaffRole.driver) {
      throw AppError.forbidden('Drivers cannot create team channels');
    }
  }

  private async ensureOpsChannels(user: AuthPrincipal) {
    if (!user.role || !CHAT_STAFF_ROLES.includes(user.role)) return;

    let team = await this.prisma.conversation.findFirst({
      where: { type: ConversationType.team, title: 'Ops floor' },
    });
    if (!team) {
      team = await this.prisma.conversation.create({
        data: { type: ConversationType.team, title: 'Ops floor' },
      });
    }

    const staff = await this.prisma.staffUser.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true },
    });
    await this.prisma.conversationParticipant.createMany({
      data: staff.map((s) => ({
        conversationId: team!.id,
        participantType: ParticipantType.staff,
        participantKey: `staff:${s.id}`,
        staffId: s.id,
      })),
      skipDuplicates: true,
    });

    if (OPS_JOIN_ROLES.includes(user.role)) {
      const threads = await this.prisma.conversation.findMany({
        where: {
          type: { in: [ConversationType.booking_support, ConversationType.client_direct] },
        },
        select: { id: true },
      });
      if (threads.length) {
        await this.prisma.conversationParticipant.createMany({
          data: threads.map((t) => ({
            conversationId: t.id,
            participantType: ParticipantType.staff,
            participantKey: `staff:${user.sub}`,
            staffId: user.sub,
          })),
          skipDuplicates: true,
        });
      }
      return;
    }

    if (user.role === StaffRole.splizer) {
      const bookings = await this.prisma.booking.findMany({
        where: { status: BookingStatus.active },
        select: { id: true },
      });
      const bookingIds = bookings.map((b) => b.id);
      if (!bookingIds.length) return;
      const threads = await this.prisma.conversation.findMany({
        where: {
          bookingId: { in: bookingIds },
          type: { in: [ConversationType.booking_support, ConversationType.client_direct] },
        },
        select: { id: true },
      });
      if (!threads.length) return;
      await this.prisma.conversationParticipant.createMany({
        data: threads.map((t) => ({
          conversationId: t.id,
          participantType: ParticipantType.staff,
          participantKey: `staff:${user.sub}`,
          staffId: user.sub,
        })),
        skipDuplicates: true,
      });
      return;
    }

    if (user.role === StaffRole.driver) {
      const assignments = await this.prisma.driverAssignment.findMany({
        where: { driver: { userId: user.sub }, status: { in: OPEN_ASSIGNMENT_STATUSES } },
        select: { bookingId: true },
      });
      const bookingIds = assignments.map((a) => a.bookingId);
      if (!bookingIds.length) return;
      const threads = await this.prisma.conversation.findMany({
        where: { bookingId: { in: bookingIds } },
        select: { id: true },
      });
      if (!threads.length) return;
      await this.prisma.conversationParticipant.createMany({
        data: threads.map((t) => ({
          conversationId: t.id,
          participantType: ParticipantType.staff,
          participantKey: `staff:${user.sub}`,
          staffId: user.sub,
        })),
        skipDuplicates: true,
      });
    }
  }

  private participantKey(user: AuthPrincipal): string {
    return user.type === 'staff' ? `staff:${user.sub}` : `client:${user.sub}`;
  }

  private participantCreateData(conversationId: string, key: string) {
    const isStaff = key.startsWith('staff:');
    const id = key.split(':')[1];
    return {
      conversationId,
      participantType: isStaff ? ParticipantType.staff : ParticipantType.client,
      participantKey: key,
      staffId: isStaff ? id : null,
      clientId: isStaff ? null : id,
    };
  }

  private async ensureParticipant(conversationId: string, user: AuthPrincipal) {
    const key = this.participantKey(user);
    let participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, participantKey: key },
    });

    // Lazy join for eligible staff (ops / assigned driver / splizer on active booking)
    if (!participant && user.type === 'staff' && user.role) {
      await this.tryLazyJoin(conversationId, user);
      participant = await this.prisma.conversationParticipant.findFirst({
        where: { conversationId, participantKey: key },
      });
    }

    if (!participant) {
      throw AppError.forbidden('Not a conversation participant');
    }
    return participant;
  }

  private async tryLazyJoin(conversationId: string, user: AuthPrincipal) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, type: true, bookingId: true },
    });
    if (!conv || !user.role) return;

    let allowed = false;
    if (OPS_JOIN_ROLES.includes(user.role)) {
      allowed =
        conv.type === ConversationType.booking_support ||
        conv.type === ConversationType.client_direct ||
        conv.type === ConversationType.team;
    } else if (user.role === StaffRole.splizer && conv.bookingId) {
      const booking = await this.prisma.booking.findFirst({
        where: { id: conv.bookingId, status: BookingStatus.active },
        select: { id: true },
      });
      allowed = Boolean(booking);
    } else if (user.role === StaffRole.driver && conv.bookingId) {
      const assignment = await this.prisma.driverAssignment.findFirst({
        where: {
          bookingId: conv.bookingId,
          status: { in: OPEN_ASSIGNMENT_STATUSES },
          driver: { userId: user.sub },
        },
        select: { id: true },
      });
      allowed = Boolean(assignment);
    }

    if (!allowed) return;

    await this.prisma.conversationParticipant.createMany({
      data: [
        {
          conversationId: conv.id,
          participantType: ParticipantType.staff,
          participantKey: `staff:${user.sub}`,
          staffId: user.sub,
        },
      ],
      skipDuplicates: true,
    });
  }

  private async assertBookingAccess(bookingId: string, user: AuthPrincipal) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, clientId: true },
    });
    if (!booking) throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');

    if (user.type === 'client') {
      if (booking.clientId !== user.sub) throw AppError.forbidden();
      return;
    }

    if (!user.role || !CHAT_STAFF_ROLES.includes(user.role)) {
      throw AppError.forbidden();
    }

    if (user.role === StaffRole.driver) {
      const assignment = await this.prisma.driverAssignment.findFirst({
        where: {
          bookingId,
          status: { in: OPEN_ASSIGNMENT_STATUSES },
          driver: { userId: user.sub },
        },
        select: { id: true },
      });
      if (!assignment) throw AppError.forbidden();
    }
  }

  private async assertBookingAccessTx(
    tx: Prisma.TransactionClient,
    bookingId: string,
    user: AuthPrincipal,
  ) {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, clientId: true },
    });
    if (!booking) throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    if (user.type === 'client' && booking.clientId !== user.sub) {
      throw AppError.forbidden();
    }
  }

  private async participantRooms(conversationId: string): Promise<string[]> {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
    });
    return participants
      .map((p) =>
        p.participantType === ParticipantType.staff
          ? p.staffId
            ? `user:${p.staffId}`
            : null
          : p.clientId
            ? `client:${p.clientId}`
            : null,
      )
      .filter((r): r is string => Boolean(r));
  }

  private async countUnread(
    conversationId: string,
    lastReadMessageId: string | null,
    user: AuthPrincipal,
  ): Promise<number> {
    const notMine: Prisma.MessageWhereInput =
      user.type === 'staff'
        ? {
            OR: [{ senderStaffId: null }, { senderStaffId: { not: user.sub } }],
          }
        : {
            OR: [{ senderClientId: null }, { senderClientId: { not: user.sub } }],
          };

    const base: Prisma.MessageWhereInput = {
      conversationId,
      AND: [notMine],
    };

    if (!lastReadMessageId) {
      return this.prisma.message.count({ where: base });
    }

    const lastRead = await this.prisma.message.findUnique({
      where: { id: lastReadMessageId },
    });
    if (!lastRead) {
      return this.prisma.message.count({ where: base });
    }

    return this.prisma.message.count({
      where: {
        ...base,
        createdAt: { gt: lastRead.createdAt },
      },
    });
  }
}
