import { StaffRole } from '@prisma/client';

/** Guest chat channels — Support / Driver / Splizer tabs. */
export const CLIENT_CHAT_ROLES = ['admin', 'driver', 'splizer'] as const;
export type ClientChatRole = (typeof CLIENT_CHAT_ROLES)[number];

export function isClientChatRole(value: unknown): value is ClientChatRole {
  return (
    typeof value === 'string' &&
    (CLIENT_CHAT_ROLES as readonly string[]).includes(value)
  );
}

export function channelForStaffRole(role: StaffRole): ClientChatRole {
  if (role === StaffRole.driver) return 'driver';
  if (role === StaffRole.splizer) return 'splizer';
  return 'admin';
}

export function staffRolesForChannel(channel: ClientChatRole): StaffRole[] {
  if (channel === 'driver') return [StaffRole.driver];
  if (channel === 'splizer') return [StaffRole.splizer];
  return [StaffRole.admin, StaffRole.ops_manager, StaffRole.support];
}
