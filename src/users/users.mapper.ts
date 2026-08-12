import { DriverProfile, StaffUser } from '@prisma/client';

export type StaffUserWithDriver = StaffUser & {
  driverProfile?: DriverProfile | null;
};

export function mapDriverProfile(profile: DriverProfile) {
  return {
    id: profile.id,
    userId: profile.userId,
    vehicleMake: profile.vehicleMake,
    vehicleModel: profile.vehicleModel,
    vehicleColor: profile.vehicleColor,
    vehicleYear: profile.vehicleYear,
    plateNumber: profile.plateNumber,
    whatsapp: profile.whatsapp,
    rating: profile.rating.toString(),
    reviewsCount: profile.reviewsCount,
    tripsCount: profile.tripsCount,
    status: profile.status,
    lastLat: profile.lastLat,
    lastLng: profile.lastLng,
    lastGpsAt: profile.lastGpsAt?.toISOString() ?? null,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export function mapStaffUser(user: StaffUserWithDriver) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    driverProfile: user.driverProfile
      ? mapDriverProfile(user.driverProfile)
      : null,
  };
}
