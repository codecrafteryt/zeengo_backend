import { PrismaClient, StaffRole } from '@prisma/client';
import * as argon2 from 'argon2';

export const DEMO_STAFF_PASSWORD = '1234567';

export const DEMO_STAFF: Array<{
  email: string;
  fullName: string;
  role: StaffRole;
}> = [
  { email: 'admin@zeengo.com', fullName: 'Zeengo Admin', role: StaffRole.admin },
  { email: 'ops@zeengo.com', fullName: 'Ops Manager', role: StaffRole.ops_manager },
  { email: 'splizer@zeengo.com', fullName: 'Splizer User', role: StaffRole.splizer },
  { email: 'support@zeengo.com', fullName: 'Support Agent', role: StaffRole.support },
  { email: 'driver@zeengo.com', fullName: 'Demo Driver', role: StaffRole.driver },
];

export async function ensureDemoStaff(
  prisma: PrismaClient,
  password = DEMO_STAFF_PASSWORD,
): Promise<void> {
  const passwordHash = await argon2.hash(password);

  for (const account of DEMO_STAFF) {
    const user = await prisma.staffUser.upsert({
      where: { email: account.email },
      update: {
        fullName: account.fullName,
        passwordHash,
        role: account.role,
        isActive: true,
        deletedAt: null,
      },
      create: {
        fullName: account.fullName,
        email: account.email,
        passwordHash,
        role: account.role,
        isActive: true,
      },
    });

    if (account.role === StaffRole.driver) {
      await prisma.driverProfile.upsert({
        where: { userId: user.id },
        update: {
          vehicleMake: 'Mercedes',
          vehicleModel: 'V-Class',
          plateNumber: 'A123BC77',
          status: 'available',
        },
        create: {
          userId: user.id,
          vehicleMake: 'Mercedes',
          vehicleModel: 'V-Class',
          plateNumber: 'A123BC77',
          status: 'available',
        },
      });
    }
  }
}
