import { PrismaClient, StaffRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Booking ZN codes use this Postgres sequence
  await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS zn_seq START 1`);

  // Shared demo password for all seeded staff roles
  const demoPassword =
    process.env.SEED_STAFF_PASSWORD?.trim() ||
    process.env.SEED_ADMIN_PASSWORD?.trim() ||
    '1234567';
  const passwordHash = await argon2.hash(demoPassword);

  const staffAccounts: Array<{
    email: string;
    fullName: string;
    role: StaffRole;
  }> = [
    {
      email: process.env.SEED_ADMIN_EMAIL?.trim() || 'admin@zeengo.com',
      fullName: 'Zeengo Admin',
      role: StaffRole.admin,
    },
    {
      email: 'ops@zeengo.com',
      fullName: 'Ops Manager',
      role: StaffRole.ops_manager,
    },
    {
      email: 'splizer@zeengo.com',
      fullName: 'Splizer User',
      role: StaffRole.splizer,
    },
    {
      email: 'driver@zeengo.com',
      fullName: 'Demo Driver',
      role: StaffRole.driver,
    },
    {
      email: 'support@zeengo.com',
      fullName: 'Support Agent',
      role: StaffRole.support,
    },
  ];

  let admin = null as Awaited<ReturnType<typeof prisma.staffUser.upsert>> | null;

  for (const account of staffAccounts) {
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
    if (account.role === StaffRole.admin) {
      admin = user;
    }
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

  if (!admin) {
    throw new Error('Admin staff user was not seeded');
  }

  const packages = [
    {
      name: 'Love Package',
      slug: 'love-package',
      pricePerPerson: 225,
      minPersons: 2,
      durationDays: 4,
      description:
        'Romantic Moscow getaway for couples — private transfers, halal dining, and curated city experiences.',
      inclusions: [
        'Moscow city 2 days',
        'Private halal restaurant reservations',
        'Red Square & Kremlin walking tour',
        'Couples spa session',
        'Airport meet & greet',
        'Dedicated support line',
      ],
    },
    {
      name: 'Family Package',
      slug: 'family-package',
      pricePerPerson: 280,
      minPersons: 1,
      durationDays: 5,
      description:
        'Moscow 3 days + Yakhorma 2 days family adventure with kid-friendly activities.',
      inclusions: [
        'Moscow city 3 days',
        'Yakhorma countryside 2 days',
        'Russian farm visit',
        'Private halal bus',
        'Halal restaurants only',
        'Family-friendly hotel rooms',
      ],
    },
    {
      name: 'Relaxation Package',
      slug: 'relaxation-package',
      pricePerPerson: 380,
      minPersons: 1,
      durationDays: 6,
      description:
        'Unhurried pace with wellness focus — spa, nature, and premium halal dining across Moscow and Yakhorma.',
      inclusions: [
        'Moscow city 3 days at leisure',
        'Yakhorma nature retreat 3 days',
        'Daily spa / wellness sessions',
        'Private driver on call',
        'Premium halal dining',
        'Flexible daily schedule',
      ],
    },
    {
      name: 'Royal Package',
      slug: 'royal-package',
      pricePerPerson: 1200,
      minPersons: 1,
      durationDays: 10,
      description:
        'Premium VIP experience — luxury hotels, private guides, bespoke itinerary, and white-glove service throughout.',
      inclusions: [
        'Moscow 5 days luxury stay',
        'St. Petersburg 3 days extension',
        'Yakhorma 2 days private estate',
        'Private Mercedes fleet',
        'Personal concierge 24/7',
        'All premium halal dining',
        'VIP airport fast-track',
        'Custom itinerary planning',
      ],
    },
  ] as const;

  for (const pkg of packages) {
    await prisma.package.upsert({
      where: { slug: pkg.slug },
      update: {
        name: pkg.name,
        pricePerPerson: pkg.pricePerPerson,
        minPersons: pkg.minPersons,
        durationDays: pkg.durationDays,
        description: pkg.description,
        inclusions: pkg.inclusions,
        isActive: true,
        deletedAt: null,
      },
      create: {
        name: pkg.name,
        slug: pkg.slug,
        pricePerPerson: pkg.pricePerPerson,
        minPersons: pkg.minPersons,
        durationDays: pkg.durationDays,
        description: pkg.description,
        inclusions: pkg.inclusions,
        isActive: true,
      },
    });
  }

  const settings = [
    { key: 'vip_price', value: 100 },
    { key: 'stripe_link_expiry_hours', value: 48 },
    { key: 'company_profile', value: {} },
  ] as const;

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {
        value: setting.value,
        updatedBy: admin.id,
      },
      create: {
        key: setting.key,
        value: setting.value,
        updatedBy: admin.id,
      },
    });
  }

  // Sample edit requests against existing bookings (idempotent via reason prefix)
  const existingBookings = await prisma.booking.findMany({
    where: { status: 'active' },
    orderBy: { createdAt: 'asc' },
    take: 5,
    include: { client: true },
  });

  if (existingBookings.length > 0) {
    const samples: Array<{
      bookingId: string;
      type: 'date_change' | 'itinerary_change' | 'vip_upgrade' | 'other';
      originalValue: string;
      requestedValue: string;
      reason: string;
      status: 'pending' | 'approved' | 'rejected';
      reviewNotes?: string;
    }> = [];

    const b0 = existingBookings[0];
    samples.push({
      bookingId: b0.id,
      type: 'date_change',
      originalValue: JSON.stringify({
        arrivalDate: b0.arrivalDate?.toISOString().slice(0, 10) ?? null,
        departureDate: b0.departureDate?.toISOString().slice(0, 10) ?? null,
      }),
      requestedValue: JSON.stringify({
        arrivalDate: b0.arrivalDate
          ? new Date(b0.arrivalDate.getTime() + 2 * 86400000).toISOString().slice(0, 10)
          : null,
        departureDate: b0.departureDate
          ? new Date(b0.departureDate.getTime() + 2 * 86400000).toISOString().slice(0, 10)
          : null,
      }),
      reason:
        '[seed] Family needs one extra day in Moscow for shopping. Request to shift itinerary by 2 days.',
      status: 'pending',
    });

    if (existingBookings[1]) {
      const b1 = existingBookings[1];
      samples.push({
        bookingId: b1.id,
        type: 'itinerary_change',
        originalValue: 'Four Seasons Moscow',
        requestedValue: 'St. Regis Moscow',
        reason: '[seed] Prefer St. Regis for the last two nights.',
        status: 'pending',
      });
    }

    if (existingBookings[2]) {
      const b2 = existingBookings[2];
      samples.push({
        bookingId: b2.id,
        type: 'other',
        originalValue: 'Pickup 11:00',
        requestedValue: 'Pickup 14:30',
        reason: '[seed] Flight delayed — please shift airport pickup.',
        status: 'pending',
      });
    }

    // One approved + one rejected for tab demos if we have enough bookings
    if (existingBookings[0]) {
      samples.push({
        bookingId: existingBookings[0].id,
        type: 'vip_upgrade',
        originalValue: JSON.stringify({ isVip: false }),
        requestedValue: JSON.stringify({ isVip: true }),
        reason: '[seed] Request Zeen Rafeq VIP concierge for the stay.',
        status: 'approved',
        reviewNotes: 'VIP package activated and client notified.',
      });
    }
    if (existingBookings[1]) {
      samples.push({
        bookingId: existingBookings[1].id,
        type: 'date_change',
        originalValue: JSON.stringify({
          arrivalDate: existingBookings[1].arrivalDate?.toISOString().slice(0, 10) ?? null,
          departureDate: existingBookings[1].departureDate?.toISOString().slice(0, 10) ?? null,
        }),
        requestedValue: JSON.stringify({
          arrivalDate: existingBookings[1].arrivalDate?.toISOString().slice(0, 10) ?? null,
          departureDate: existingBookings[1].departureDate
            ? new Date(existingBookings[1].departureDate.getTime() + 5 * 86400000)
                .toISOString()
                .slice(0, 10)
            : null,
        }),
        reason: '[seed] Extend stay by 5 nights for additional business meetings.',
        status: 'rejected',
        reviewNotes: 'Driver unavailable on requested extension dates; hotel fully booked.',
      });
    }

    let seeded = 0;
    for (const sample of samples) {
      const exists = await prisma.editRequest.findFirst({
        where: { reason: sample.reason },
      });
      if (exists) continue;
      await prisma.editRequest.create({
        data: {
          bookingId: sample.bookingId,
          type: sample.type,
          originalValue: sample.originalValue,
          requestedValue: sample.requestedValue,
          reason: sample.reason,
          status: sample.status,
          reviewNotes: sample.reviewNotes,
          reviewedBy:
            sample.status !== 'pending' ? admin.id : undefined,
          reviewedAt: sample.status !== 'pending' ? new Date() : undefined,
        },
      });
      seeded += 1;
    }
    console.log(`Edit requests seeded: ${seeded} new (of ${samples.length} samples)`);
  } else {
    console.log('Edit requests seed skipped — no active bookings yet');
  }

  console.log('Seed complete — staff accounts (password: demo password):');
  for (const account of staffAccounts) {
    console.log(`  ${account.role.padEnd(12)} ${account.email}`);
  }
  console.log(`Packages seeded: ${packages.map((p) => p.slug).join(', ')}`);
  console.log(`Settings seeded: ${settings.map((s) => s.key).join(', ')}`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
