import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { StaffRole } from '@prisma/client';
import { RealtimeEmitter } from './realtime.emitter';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';

type JwtPayload = {
  sub: string;
  type: 'staff' | 'client';
  role?: StaffRole;
};

@WebSocketGateway({ namespace: '/ws', cors: { origin: '*' } })
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly emitter: RealtimeEmitter,
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
}
