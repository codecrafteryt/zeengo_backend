import { OtpPurpose, StaffRole } from '@prisma/client';
import { z } from 'zod';

export const staffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const clientRegisterSchema = z.object({
  fullName: z.string().min(1).max(200),
  phone: z.string().min(6).max(32),
  password: z.string().min(8).max(128),
  email: z.string().email().optional(),
  nationality: z.string().max(100).optional(),
  preferredLang: z.enum(['ar', 'en']).optional(),
});

export const verifyOtpSchema = z.object({
  phone: z.string().min(6).max(32),
  code: z.string().length(6),
  purpose: z.nativeEnum(OtpPurpose),
});

export const clientLoginSchema = z.object({
  phone: z.string().min(6).max(32),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  phone: z.string().min(6).max(32),
});

export const resetPasswordSchema = z.object({
  phone: z.string().min(6).max(32),
  code: z.string().length(6),
  newPassword: z.string().min(8).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const fcmTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web']),
});

export type StaffLoginInput = z.infer<typeof staffLoginSchema>;
export type ClientRegisterInput = z.infer<typeof clientRegisterSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ClientLoginInput = z.infer<typeof clientLoginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type FcmTokenInput = z.infer<typeof fcmTokenSchema>;

export const staffRoleSchema = z.nativeEnum(StaffRole);
