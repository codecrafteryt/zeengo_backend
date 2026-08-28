import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

export type RealtimeEvent =
  | 'payment.recorded'
  | 'payment.updated'
  | 'sos.created'
  | 'sos.resolved'
  | 'message.new'
  | 'message.translated'
  | 'message.read'
  | 'chat.typing'
  | 'notification.new'
  | 'booking.created'
  | 'driver.updated'
  | 'task.updated'
  | 'edit_request.created'
  | 'edit_request.updated';

@Injectable()
export class RealtimeEmitter {
  private readonly logger = new Logger(RealtimeEmitter.name);
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
    this.logger.log('WebSocket server attached to RealtimeEmitter');
  }

  emit(event: RealtimeEvent | string, payload: unknown, rooms?: string[]): void {
    this.logger.debug(`[realtime] ${event}`, { rooms, payload });

    if (!this.server) return;

    if (rooms?.length) {
      for (const room of rooms) {
        this.server.to(room).emit(event, payload);
      }
      return;
    }

    this.server.emit(event, payload);
  }
}
