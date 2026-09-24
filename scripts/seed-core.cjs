/**
 * Production-safe core seed (no ts-node). Staff + packages + settings + zn_seq.
 * Password: SEED_STAFF_PASSWORD / SEED_ADMIN_PASSWORD / 1234567
 */
const { PrismaClient, StaffRole } = require('@prisma/client');
const argon2 = require('argon2');

const DEMO_STAFF = [
  { email: 'admin@zeengo.com', fullName: 'Zeengo Admin', role: StaffRole.admin },
  { email: 'ops@zeengo.com', fullName: 'Ops Manager', role: StaffRole.ops_manager },
  { email: 'splizer@zeengo.com', fullName: 'Splizer User', role: StaffRole.splizer },
  { email: 'support@zeengo.com', fullName: 'Support Agent', role: StaffRole.support },
  { email: 'driver@zeengo.com', fullName: 'Demo Driver', role: StaffRole.driver },
];

const PACKAGES = [
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
];

async function main() {
  const prisma = new PrismaClient();
  const password =
    process.env.SEED_STAFF_PASSWORD?.trim() ||
    process.env.SEED_ADMIN_PASSWORD?.trim() ||
    '1234567';

  try {
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS zn_seq START 1`);
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

    const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim() || 'admin@zeengo.com';
    const admin = await prisma.staffUser.findUnique({ where: { email: adminEmail } });
    if (!admin) throw new Error('Admin not seeded');

    for (const pkg of PACKAGES) {
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

    for (const setting of [
      { key: 'vip_price', value: 100 },
      { key: 'stripe_link_expiry_hours', value: 48 },
      { key: 'company_profile', value: {} },
    ]) {
      await prisma.setting.upsert({
        where: { key: setting.key },
        update: { value: setting.value, updatedBy: admin.id },
        create: { key: setting.key, value: setting.value, updatedBy: admin.id },
      });
    }

    console.log('SEED_OK', {
      staff: DEMO_STAFF.map((s) => s.email),
      packages: PACKAGES.length,
      passwordSet: true,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('SEED_FAIL', e);
  process.exit(1);
});
