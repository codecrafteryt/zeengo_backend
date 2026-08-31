import { z } from 'zod';
import { AssignmentStatus, DriverStatus } from '@prisma/client';
import { paginationSchema } from '../common/pagination/pagination';

export const listDriversQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(DriverStatus).optional(),
});

export const driverIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const updateDriverSchema = z.object({
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  vehicleColor: z.string().optional(),
  vehicleYear: z.coerce.number().int().min(1900).max(2100).optional(),
  plateNumber: z.string().optional(),
  whatsapp: z.string().optional(),
  status: z.nativeEnum(DriverStatus).optional(),
});

export const scheduleQuerySchema = z.object({
  date: z
    .string()
    .refine(
      (v) => v === 'today' || v === 'tomorrow' || /^\d{4}-\d{2}-\d{2}$/.test(v),
      'date must be YYYY-MM-DD, today, or tomorrow',
    )
    .default('today'),
});

export const createAssignmentSchema = z.object({
  bookingId: z.string().uuid(),
  driverId: z.string().uuid(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export const updateMyStatusSchema = z.object({
  status: z.nativeEnum(DriverStatus),
});

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const updateMyVehicleSchema = z.object({
  vehicleMake: z.string().trim().min(1).max(80),
  vehicleModel: z.string().trim().min(1).max(80),
  vehicleColor: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
  vehicleYear: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1990).max(2100).optional(),
  ),
  plateNumber: z.string().trim().min(1).max(20),
  whatsapp: z.preprocess(emptyToUndefined, z.string().trim().max(32).optional()),
});

export const updateMyScheduleItemSchema = z.object({
  status: z.enum(['pending', 'active', 'done', 'cancelled']),
});

export const gpsPingSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export type ListDriversQuery = z.infer<typeof listDriversQuerySchema>;
export type UpdateDriverDto = z.infer<typeof updateDriverSchema>;
export type ScheduleQuery = z.infer<typeof scheduleQuerySchema>;
export type CreateAssignmentDto = z.infer<typeof createAssignmentSchema>;
export type UpdateMyStatusDto = z.infer<typeof updateMyStatusSchema>;
export type UpdateMyVehicleDto = z.infer<typeof updateMyVehicleSchema>;
export type UpdateMyScheduleItemDto = z.infer<typeof updateMyScheduleItemSchema>;
export type GpsPingDto = z.infer<typeof gpsPingSchema>;

export { AssignmentStatus, DriverStatus };
