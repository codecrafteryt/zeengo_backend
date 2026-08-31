import { Inject, Logger, forwardRef } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { StaffRole } from '@prisma/client';
import { RealtimeEmitter } from './realtime.emitter';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { ChatService } from '../chat/chat.service';

type JwtPayload = {
  sub: string;
  type: 'staff' | 'client';
  role?: StaffRole;
};

function resolveWsCorsOrigin(): boolean | string[] {
  const raw =
    process.env.APP_WEB_ORIGIN ||
    process.env.CORS_ORIGIN ||
    'http://localhost:5173,http://127.0.0.1:5173';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0 || list.includes('*')) {
    return process.env.NODE_ENV === 'production' ? [] : true;
  }
  const origins = new Set(list);
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:5173');
    origins.add('http://127.0.0.1:5173');
    origins.add('http://localhost:4173');
    origins.add('http://127.0.0.1:4173');
  }
  return [...origins];
}

@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: resolveWsCorsOrigin(),
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly emitter: RealtimeEmitter,
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
  ) {}

  afterInit() {
    this.emitter.setServer(this.server);
    this.logger.log('Realtime gateway initialized on /ws');
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      const user: AuthPrincipal = {
        sub: payload.sub,
        type: payload.type,
        role: payload.role,
      };

      client.data.user = user;

      if (user.type === 'staff') {
        await client.join(`user:${user.sub}`);
        if (user.role) {
          await client.join(`role:${user.role}`);
        }
      } else {
        await client.join(`client:${user.sub}`);
      }

      this.logger.debug(`Client connected: ${user.type}:${user.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as AuthPrincipal | undefined;
    if (user) {
      this.logger.debug(`Client disconnected: ${user.type}:${user.sub}`);
    }
  }

  @SubscribeMessage('chat.join')
  async onChatJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const user = client.data.user as AuthPrincipal | undefined;
    const conversationId = body?.conversationId?.trim();
    if (!user || !conversationId) {
      return { ok: false, error: 'INVALID' };
    }
    try {
      await this.chatService.assertCanJoinConversation(conversationId, user);
      await client.join(`conversation:${conversationId}`);
      return { ok: true, conversationId };
    } catch {
      return { ok: false, error: 'FORBIDDEN' };
    }
  }

  @SubscribeMessage('chat.leave')
  async onChatLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const conversationId = body?.conversationId?.trim();
    if (!conversationId) return { ok: false };
    await client.leave(`conversation:${conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('chat.typing')
  async onChatTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const user = client.data.user as AuthPrincipal | undefined;
    const conversationId = body?.conversationId?.trim();
    if (!user || !conversationId) return { ok: false };
    try {
      await this.chatService.assertCanJoinConversation(conversationId, user);
      client.to(`conversation:${conversationId}`).emit('chat.typing', {
        conversationId,
        userType: user.type,
        userId: user.sub,
        role: user.role ?? null,
      });
      return { ok: true };
    } catch {
      return { ok: false, error: 'FORBIDDEN' };
    }
  }
}
