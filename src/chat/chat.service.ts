import { Injectable } from '@nestjs/common';
import {
  ConversationType,
  ParticipantType,
  Prisma,
  SenderType,
  StaffRole,
} from '@prisma/client';
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

const messageInclude = {
  senderStaff: true,
  senderClient: true,
} satisfies Prisma.MessageInclude;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEmitter,
    private readonly jobs: JobsService,
  ) {}

  async listConversations(user: AuthPrincipal) {
    const participantKey = this.participantKey(user);
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { participantKey },
      include: {
        conversation: {
          include: {
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const results = await Promise.all(
      participants.map(async (p) => {
        const unread = await this.countUnread(p.conversationId, p.lastReadMessageId);
        const lastMsg = p.conversation.messages[0];
        return mapConversation(
          p.conversation,
          unread,
          lastMsg?.createdAt.toISOString() ?? null,
        );
      }),
    );

    return results;
  }

  async createConversation(dto: CreateConversationDto, user: AuthPrincipal) {
    const participantIds = dto.participantIds ?? [];

    const row = await this.prisma.$transaction(async (tx) => {
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

      for (const key of keys) {
        const isStaff = key.startsWith('staff:');
        const id = key.split(':')[1];
        await tx.conversationParticipant.create({
          data: {
            conversationId: conversation.id,
            participantType: isStaff ? ParticipantType.staff : ParticipantType.client,
            participantKey: key,
            staffId: isStaff ? id : null,
            clientId: isStaff ? null : id,
          },
        });
      }

      return conversation;
    });

    return mapConversation(row);
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

    return { read: true };
  }

  async listClientThreads(user: AuthPrincipal) {
    if (user.type !== 'staff' || !user.role || !CHAT_STAFF_ROLES.includes(user.role)) {
      throw AppError.forbidden();
    }

    let bookingIds: string[] | undefined;

    if (user.role === StaffRole.splizer) {
      const bookings = await this.prisma.booking.findMany({
        where: { status: 'active' },
        select: { id: true },
      });
      bookingIds = bookings.map((b) => b.id);
    } else if (user.role === StaffRole.driver) {
      const assignments = await this.prisma.driverAssignment.findMany({
        where: { driver: { userId: user.sub }, status: 'active' },
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
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        participants: { include: { client: true, staff: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => {
      const clientParticipant = row.participants.find((p) => p.clientId);
      const title =
        row.title ??
        (clientParticipant?.client?.fullName
          ? `Chat — ${clientParticipant.client.fullName}`
          : null);
      return {
        ...mapConversation(row, 0, row.messages[0]?.createdAt.toISOString() ?? null),
        title,
        clientName: clientParticipant?.client?.fullName ?? null,
        znCode: null as string | null,
      };
    });
  }

  private participantKey(user: AuthPrincipal): string {
    return user.type === 'staff' ? `staff:${user.sub}` : `client:${user.sub}`;
  }

  private async ensureParticipant(conversationId: string, user: AuthPrincipal) {
    const key = this.participantKey(user);
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, participantKey: key },
    });
    if (!participant) {
      throw AppError.forbidden('Not a conversation participant');
    }
    return participant;
  }

  private async participantRooms(conversationId: string): Promise<string[]> {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
    });
    return participants.map((p) =>
      p.participantType === ParticipantType.staff
        ? `user:${p.staffId}`
        : `client:${p.clientId}`,
    );
  }

  private async countUnread(
    conversationId: string,
    lastReadMessageId: string | null,
  ): Promise<number> {
    if (!lastReadMessageId) {
      return this.prisma.message.count({ where: { conversationId } });
    }

    const lastRead = await this.prisma.message.findUnique({
      where: { id: lastReadMessageId },
    });
    if (!lastRead) {
      return this.prisma.message.count({ where: { conversationId } });
    }

    return this.prisma.message.count({
      where: { conversationId, createdAt: { gt: lastRead.createdAt } },
    });
  }
}
