import { StaffRole } from '@prisma/client';
import {
  assertDriverAssignedToBooking,
  isDriverPrincipal,
} from './booking-access.util';
import { AppError } from './errors/app-error';
import type { AuthPrincipal } from './decorators/current-user.decorator';

describe('booking-access.util (Phase 2 security)', () => {
  const driver: AuthPrincipal = {
    sub: 'driver-user-1',
    type: 'staff',
    role: StaffRole.driver,
  };
  const admin: AuthPrincipal = {
    sub: 'admin-1',
    type: 'staff',
    role: StaffRole.admin,
  };

  it('identifies driver principals', () => {
    expect(isDriverPrincipal(driver)).toBe(true);
    expect(isDriverPrincipal(admin)).toBe(false);
  });

  it('allows non-drivers without assignment lookup', async () => {
    const findFirst = jest.fn();
    await assertDriverAssignedToBooking({
      user: admin,
      bookingId: 'booking-a',
      driverAssignments: { findFirst },
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('forbids driver when not assigned to booking', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    await expect(
      assertDriverAssignedToBooking({
        user: driver,
        bookingId: 'booking-b',
        driverAssignments: { findFirst },
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(findFirst).toHaveBeenCalled();
  });

  it('allows driver when assignment exists', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'asg-1' });
    await expect(
      assertDriverAssignedToBooking({
        user: driver,
        bookingId: 'booking-a',
        driverAssignments: { findFirst },
      }),
    ).resolves.toBeUndefined();
  });

  it('does not allow bookingId spoofing without assignment', async () => {
    const findFirst = jest.fn().mockImplementation(async (args: { where: { bookingId: string } }) => {
      if (args.where.bookingId === 'booking-owned') return { id: 'asg-1' };
      return null;
    });

    await expect(
      assertDriverAssignedToBooking({
        user: driver,
        bookingId: 'booking-owned',
        driverAssignments: { findFirst },
      }),
    ).resolves.toBeUndefined();

    await expect(
      assertDriverAssignedToBooking({
        user: driver,
        bookingId: 'booking-other-driver',
        driverAssignments: { findFirst },
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
