import { StaffRole } from '@prisma/client';
import { z } from 'zod';

export const listUsersQuerySchema = z.object({
  role: z.nativeEnum(StaffRole).optional(),
});

export const createStaffUserSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(32).optional(),
  password: z.string().min(8).max(128),
  role: z.nativeEnum(StaffRole),
  avatarUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
});

export const updateStaffUserSchema = z
  .object({
    fullName: z.string().min(1).max(200).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(32).nullable().optional(),
    role: z.nativeEnum(StaffRole).optional(),
    avatarUrl: z.string().url().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const resetStaffPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateStaffUserInput = z.infer<typeof createStaffUserSchema>;
export type UpdateStaffUserInput = z.infer<typeof updateStaffUserSchema>;
export type ResetStaffPasswordInput = z.infer<typeof resetStaffPasswordSchema>;
