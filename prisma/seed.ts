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

  const driverProfile = await prisma.driverProfile.findFirst({
    where: { user: { email: 'driver@zeengo.com', deletedAt: null } },
  });
  const reviewBookings = await prisma.booking.findMany({
    where: { status: 'active' },
    orderBy: { createdAt: 'asc' },
    take: 2,
  });
  if (driverProfile && reviewBookings.length > 0) {
    const samples = [
      {
        booking: reviewBookings[0],
        rating: 5,
        comment: 'Punctual and very professional throughout the day.',
      },
      reviewBookings[1]
        ? {
            booking: reviewBookings[1],
            rating: 4,
            comment: 'Smooth airport transfer. Car was clean.',
          }
        : null,
    ].filter((row): row is NonNullable<typeof row> => Boolean(row));

    for (const sample of samples) {
      await prisma.driverReview.upsert({
        where: {
          bookingId_driverId: {
            bookingId: sample.booking.id,
            driverId: driverProfile.id,
          },
        },
        create: {
          bookingId: sample.booking.id,
          clientId: sample.booking.clientId,
          driverId: driverProfile.id,
          rating: sample.rating,
          comment: sample.comment,
        },
        update: {},
      });
    }

    const agg = await prisma.driverReview.aggregate({
      where: { driverId: driverProfile.id },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await prisma.driverProfile.update({
      where: { id: driverProfile.id },
      data: {
        rating: agg._count._all ? Number(agg._avg.rating ?? 0).toFixed(1) : '0.0',
        reviewsCount: agg._count._all,
      },
    });
    console.log(`Driver reviews seeded: ${agg._count._all} for driver@zeengo.com`);
  }

  const vendorSamples: Array<{
    name: string;
    type: 'hotel' | 'restaurant' | 'guide' | 'bus' | 'activity' | 'driver';
    city: string;
    contactName: string;
    phone: string;
    email: string;
    commissionPct: number;
    paymentTerms: 'bank_transfer' | 'cash' | 'voucher';
    cancellationPolicy: string;
    notes: string;
  }> = [
    {
      name: 'Courtyard Marriott Moscow City',
      type: 'hotel',
      city: 'Moscow',
      contactName: 'Sergei Volkov',
      phone: '+74952345678',
      email: 'revenue@marriott.ru',
      commissionPct: 7,
      paymentTerms: 'bank_transfer',
      cancellationPolicy: 'Free cancel 48h before arrival; 1 night after.',
      notes: 'Group block + VIP suites. Halal breakfast on request.',
    },
    {
      name: 'Lotte Hotel Moscow',
      type: 'hotel',
      city: 'Moscow',
      contactName: 'Elena Sorokina',
      phone: '+74951234567',
      email: 'groups@lotte.ru',
      commissionPct: 8,
      paymentTerms: 'bank_transfer',
      cancellationPolicy: 'Free cancel 72h before arrival.',
      notes: 'Preferred partner. Arabic-speaking concierge.',
    },
    {
      name: 'Novotel Moscow Centre',
      type: 'hotel',
      city: 'Moscow',
      contactName: 'Ivan Petrov',
      phone: '+74957890123',
      email: 'h5307-re@accor.com',
      commissionPct: 10,
      paymentTerms: 'bank_transfer',
      cancellationPolicy: 'Free cancel 24h before arrival.',
      notes: 'Family rooms. Walking distance to Red Square.',
    },
    {
      name: 'Yakhorma Resort & Spa',
      type: 'hotel',
      city: 'Yakhorma',
      contactName: 'Olga Belova',
      phone: '+74951220011',
      email: 'reservations@yakhorma.ru',
      commissionPct: 12,
      paymentTerms: 'bank_transfer',
      cancellationPolicy: 'Free cancel 7 days before check-in.',
      notes: 'Countryside wellness. Halal kitchen.',
    },
    {
      name: 'Al-Medina Halal Restaurant',
      type: 'restaurant',
      city: 'Moscow',
      contactName: 'Ahmad Khalil',
      phone: '+74956667788',
      email: 'book@almedina.ru',
      commissionPct: 10,
      paymentTerms: 'cash',
      cancellationPolicy: 'Cancel same morning for lunch; 4h for dinner.',
      notes: 'Certified halal. Private dining for VIP.',
    },
    {
      name: 'Novikov Restaurant',
      type: 'restaurant',
      city: 'Moscow',
      contactName: 'Maria Novikova',
      phone: '+74951112233',
      email: 'events@novikov.ru',
      commissionPct: 8,
      paymentTerms: 'bank_transfer',
      cancellationPolicy: '48h for private rooms.',
      notes: 'Halal menu on request. Dress code evening.',
    },
    {
      name: 'White Rabbit',
      type: 'restaurant',
      city: 'Moscow',
      contactName: 'Daria Orlova',
      phone: '+74954445566',
      email: 'reserve@whiterabbit.ru',
      commissionPct: 5,
      paymentTerms: 'bank_transfer',
      cancellationPolicy: '72h for window tables.',
      notes: 'VIP window seating. Advance booking required.',
    },
    {
      name: 'Yurt Restaurant (Halal)',
      type: 'restaurant',
      city: 'Yakhorma',
      contactName: 'Ruslan Bekov',
      phone: '+74950001122',
      email: 'yurt@yakhorma.ru',
      commissionPct: 0,
      paymentTerms: 'cash',
      cancellationPolicy: 'Same-day cancel OK.',
      notes: 'Halal lamb and family platters.',
    },
    {
      name: 'Moscow Premium Tours',
      type: 'guide',
      city: 'Moscow',
      contactName: 'Pavel Smirnov',
      phone: '+79031234567',
      email: 'desk@mptours.ru',
      commissionPct: 15,
      paymentTerms: 'bank_transfer',
      cancellationPolicy: 'Free cancel 24h before tour.',
      notes: 'EN/AR/RU guides. Kremlin skip-the-line.',
    },
    {
      name: 'Natasha Ivanova — VIP Guide',
      type: 'guide',
      city: 'Moscow',
      contactName: 'Natasha Ivanova',
      phone: '+79035551212',
      email: 'natasha.vip@guides.ru',
      commissionPct: 0,
      paymentTerms: 'cash',
      cancellationPolicy: '48h notice.',
      notes: 'Arabic + English. Royal package preferred.',
    },
    {
      name: 'VIP Moscow Transfer',
      type: 'bus',
      city: 'Moscow',
      contactName: 'Andrei Kozlov',
      phone: '+74957770011',
      email: 'ops@viptransfer.ru',
      commissionPct: 8,
      paymentTerms: 'bank_transfer',
      cancellationPolicy: 'Free cancel 12h before pickup.',
      notes: 'Sprinter + minibus. Airport SVO/DME/VKO.',
    },
    {
      name: 'Bolshoi Theatre (Tickets)',
      type: 'activity',
      city: 'Moscow',
      contactName: 'Box Office Groups',
      phone: '+74952505555',
      email: 'groups@bolshoi.ru',
      commissionPct: 0,
      paymentTerms: 'voucher',
      cancellationPolicy: 'Non-refundable once issued.',
      notes: 'Dress circle / VIP box on request.',
    },
    {
      name: 'Catherine Palace VIP',
      type: 'activity',
      city: 'St. Petersburg',
      contactName: 'Anna Lebedeva',
      phone: '+78123200000',
      email: 'vip@tzar.ru',
      commissionPct: 12,
      paymentTerms: 'voucher',
      cancellationPolicy: '72h before visit.',
      notes: 'Early entry. Amber Room timed tickets.',
    },
    {
      name: 'Hermitage Museum — SPb',
      type: 'activity',
      city: 'St. Petersburg',
      contactName: 'Groups Desk',
      phone: '+78127109079',
      email: 'excursions@hermitage.ru',
      commissionPct: 10,
      paymentTerms: 'voucher',
      cancellationPolicy: '24h before visit.',
      notes: 'Skip-the-line group tickets.',
    },
    {
      name: 'NordStar Local Drivers',
      type: 'driver',
      city: 'Moscow',
      contactName: 'Igor Fedorov',
      phone: '+79031110022',
      email: 'ops@nordstar.example',
      commissionPct: 15,
      paymentTerms: 'bank_transfer',
      cancellationPolicy: 'Free cancel 6h before shift.',
      notes: 'Overflow fleet when Zeengo drivers are full.',
    },
  ];

  let vendorSeeded = 0;
  for (const sample of vendorSamples) {
    const existing = await prisma.vendor.findFirst({
      where: { name: sample.name, deletedAt: null },
    });
    if (existing) {
      await prisma.vendor.update({
        where: { id: existing.id },
        data: sample,
      });
    } else {
      await prisma.vendor.create({ data: sample });
      vendorSeeded += 1;
    }
  }
  console.log(`Vendors seeded: ${vendorSeeded} new (of ${vendorSamples.length})`);

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
