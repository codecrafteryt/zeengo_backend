import { PrismaClient, StaffRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail =
    process.env.SEED_ADMIN_EMAIL?.trim() || 'admin@zeengo.com';
  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD?.trim() || 'Admin123!';

  const passwordHash = await argon2.hash(adminPassword);

  const admin = await prisma.staffUser.upsert({
    where: { email: adminEmail },
    update: {
      fullName: 'Zeengo Admin',
      passwordHash,
      role: StaffRole.admin,
      isActive: true,
      deletedAt: null,
    },
    create: {
      fullName: 'Zeengo Admin',
      email: adminEmail,
      passwordHash,
      role: StaffRole.admin,
      isActive: true,
    },
  });

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

  console.log(`Seed complete — admin: ${adminEmail} (${admin.id})`);
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
