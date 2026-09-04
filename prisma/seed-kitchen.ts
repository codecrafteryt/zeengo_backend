/**
 * Seed suppliers + guests from ZEENTRAVEL Kitchen Excel export.
 *
 * Source JSON: prisma/data/kitchen-seed.json
 * Usage:
 *   python3 scripts/export-kitchen-xlsx.py
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-kitchen.ts
 *
 * Env:
 *   KITCHEN_SEED_BOOKINGS=0  → clients only, no bookings
 *   KITCHEN_GUEST_PASSWORD   → default guest login password (new clients)
 */
import * as fs from 'fs';
import * as path from 'path';
import * as argon2 from 'argon2';
import { PrismaClient, VendorType, StaffRole, DriverStatus } from '@prisma/client';

const prisma = new PrismaClient();

type VendorRow = {
  name: string;
  type: 'hotel' | 'activity' | 'guide' | 'driver';
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

type DriverRow = {
  fullName: string;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: number | null;
  whatsapp?: string | null;
  phone?: string | null;
  city?: string | null;
  notes?: string | null;
};

type ClientRow = {
  fullName: string;
  phone: string;
  nationality?: string | null;
  legacyCode?: string | null;
  partySize?: number | null;
  dateRange?: string | null;
  nights?: number | null;
  salesOwner?: string | null;
  rawPax?: string | null;
};

type KitchenData = {
  hotels: VendorRow[];
  activities: VendorRow[];
  guides: VendorRow[];
  drivers: DriverRow[];
  clients: ClientRow[];
};

function vendorKey(name: string, type: string, city?: string | null) {
  return `${type}|${name.trim().toLowerCase()}|${(city || '').trim().toLowerCase()}`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '.')
    .slice(0, 40);
}

async function seedVendors(
  rows: VendorRow[],
  type: VendorType,
): Promise<{ created: number; updated: number; skipped: number }> {
  const existing = await prisma.vendor.findMany({
    where: { type, deletedAt: null },
    select: { id: true, name: true, city: true, phone: true, email: true, notes: true },
  });
  const byKey = new Map(existing.map((v) => [vendorKey(v.name, type, v.city), v]));
  const updateExisting = process.env.KITCHEN_UPDATE_VENDORS === '1';

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const toCreate: Array<{
    name: string;
    type: VendorType;
    city: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
    isActive: boolean;
  }> = [];

  for (const row of rows) {
    const name = row.name?.trim();
    if (!name || name.length < 2) {
      skipped++;
      continue;
    }
    const city = row.city?.trim() || null;
    const key = vendorKey(name, type, city);
    const prev = byKey.get(key);
    if (prev) {
      if (!updateExisting || prev.id === 'pending') {
        skipped++;
        continue;
      }
      await prisma.vendor.update({
        where: { id: prev.id },
        data: {
          phone: row.phone ?? prev.phone,
          email: row.email ?? prev.email,
          notes: row.notes ?? prev.notes,
          isActive: true,
          deletedAt: null,
        },
      });
      updated++;
    } else {
      toCreate.push({
        name,
        type,
        city,
        phone: row.phone ?? null,
        email: row.email ?? null,
        notes: row.notes ?? null,
        isActive: true,
      });
      byKey.set(key, {
        id: 'pending',
        name,
        city,
        phone: row.phone ?? null,
        email: row.email ?? null,
        notes: row.notes ?? null,
      });
      created++;
    }
  }

  const chunk = 100;
  for (let i = 0; i < toCreate.length; i += chunk) {
    await prisma.vendor.createMany({ data: toCreate.slice(i, i + chunk) });
    console.log(`${type} created ${Math.min(i + chunk, toCreate.length)}/${toCreate.length}`);
  }

  return { created, updated, skipped };
}

async function upsertDriver(row: DriverRow, passwordHash: string) {
  const fullName = row.fullName?.trim();
  if (!fullName) return 'skipped' as const;

  const emailBase = slugify(fullName) || `driver.${Date.now()}`;
  const email = `${emailBase}@zeengo.drivers.local`;
  const phone = row.phone || row.whatsapp || null;

  let staff = await prisma.staffUser.findFirst({
    where: {
      OR: [
        { email },
        ...(phone ? [{ phone }] : []),
        { fullName: { equals: fullName, mode: 'insensitive' }, role: StaffRole.driver },
      ],
      deletedAt: null,
    },
    include: { driverProfile: true },
  });

  if (!staff) {
    await prisma.staffUser.create({
      data: {
        fullName,
        email,
        phone,
        passwordHash,
        role: StaffRole.driver,
        isActive: true,
        driverProfile: {
          create: {
            vehicleMake: row.vehicleMake ?? null,
            vehicleModel: row.vehicleModel ?? null,
            vehicleYear: row.vehicleYear ?? null,
            whatsapp: row.whatsapp ?? phone,
            status: DriverStatus.off_duty,
          },
        },
      },
    });
    await seedVendors(
      [
        {
          name: fullName,
          type: 'driver',
          city: row.city,
          phone,
          notes:
            [row.notes, row.vehicleMake && `Vehicle: ${row.vehicleMake}`, row.vehicleYear && `Year: ${row.vehicleYear}`]
              .filter(Boolean)
              .join(' | ') || null,
        },
      ],
      VendorType.driver,
    );
    return 'created' as const;
  }

  await prisma.staffUser.update({
    where: { id: staff.id },
    data: { phone: phone ?? staff.phone, isActive: true, deletedAt: null },
  });
  if (staff.driverProfile) {
    await prisma.driverProfile.update({
      where: { id: staff.driverProfile.id },
      data: {
        vehicleMake: row.vehicleMake ?? staff.driverProfile.vehicleMake,
        vehicleModel: row.vehicleModel ?? staff.driverProfile.vehicleModel,
        vehicleYear: row.vehicleYear ?? staff.driverProfile.vehicleYear,
        whatsapp: row.whatsapp ?? staff.driverProfile.whatsapp,
      },
    });
  } else {
    await prisma.driverProfile.create({
      data: {
        userId: staff.id,
        vehicleMake: row.vehicleMake ?? null,
        vehicleModel: row.vehicleModel ?? null,
        vehicleYear: row.vehicleYear ?? null,
        whatsapp: row.whatsapp ?? phone,
        status: DriverStatus.off_duty,
      },
    });
  }
  return 'updated' as const;
}

async function upsertClient(
  row: ClientRow,
  passwordHash: string,
  adminId: string,
  packageId: string,
  createBooking: boolean,
) {
  const phone = row.phone?.trim();
  const fullName = row.fullName?.trim();
  if (!phone || !fullName) return { client: 'skipped' as const, booking: 'skipped' as const };

  let client = await prisma.client.findUnique({ where: { phone } });
  let clientStatus: 'created' | 'updated' = 'updated';
  if (!client) {
    client = await prisma.client.create({
      data: {
        fullName,
        phone,
        nationality: row.nationality ?? null,
        passwordHash,
        phoneVerifiedAt: new Date(),
        preferredLang: 'ar',
      },
    });
    clientStatus = 'created';
  } else {
    await prisma.client.update({
      where: { id: client.id },
      data: {
        fullName: client.fullName || fullName,
        nationality: client.nationality ?? row.nationality ?? null,
        passwordHash: client.passwordHash ?? passwordHash,
        deletedAt: null,
      },
    });
  }

  if (!createBooking) return { client: clientStatus, booking: 'skipped' as const };

  const legacyTag = row.legacyCode ? `legacyCode:${row.legacyCode}` : null;
  if (legacyTag) {
    const existingBooking = await prisma.booking.findFirst({
      where: { clientId: client.id, internalNotes: { contains: legacyTag } },
    });
    if (existingBooking) return { client: clientStatus, booking: 'skipped' as const };
  } else {
    const any = await prisma.booking.count({ where: { clientId: client.id } });
    if (any > 0) return { client: clientStatus, booking: 'skipped' as const };
  }

  const notes = [
    legacyTag,
    row.dateRange && `Dates: ${row.dateRange}`,
    row.nights != null && `Nights: ${row.nights}`,
    row.rawPax && `PAX: ${row.rawPax}`,
    row.salesOwner && `Sales: ${row.salesOwner}`,
    'Source: ZEENTRAVEL Kitchen.xlsx',
  ]
    .filter(Boolean)
    .join(' | ');

  const znRows = await prisma.$queryRaw<Array<{ zn: string }>>`
    SELECT 'ZN' || lpad(nextval('zn_seq')::text, 4, '0') AS zn
  `;
  const znCode = znRows[0]?.zn;
  if (!znCode) throw new Error('Failed to allocate znCode');

  await prisma.booking.create({
    data: {
      znCode,
      clientId: client.id,
      packageId,
      partySize: row.partySize && row.partySize > 0 ? row.partySize : 2,
      totalAmount: 0,
      status: 'active',
      internalNotes: notes,
      createdBy: adminId,
    },
  });

  return { client: clientStatus, booking: 'created' as const };
}

async function main(): Promise<void> {
  const jsonPath =
    process.env.KITCHEN_SEED_JSON?.trim() ||
    path.join(__dirname, 'data', 'kitchen-seed.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Missing ${jsonPath}. Run: python3 scripts/export-kitchen-xlsx.py`);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as KitchenData;
  const createBookings = process.env.KITCHEN_SEED_BOOKINGS !== '0';
  const guestPassword = process.env.KITCHEN_GUEST_PASSWORD?.trim() || 'ZeenGuest2026';
  const driverPassword =
    process.env.SEED_STAFF_PASSWORD?.trim() ||
    process.env.SEED_ADMIN_PASSWORD?.trim() ||
    '1234567';

  await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS zn_seq START 1`);

  const admin =
    (await prisma.staffUser.findUnique({
      where: { email: process.env.SEED_ADMIN_EMAIL?.trim() || 'admin@zeengo.com' },
    })) ||
    (await prisma.staffUser.findFirst({ where: { role: StaffRole.admin, deletedAt: null } }));
  if (!admin) throw new Error('No admin staff user — run prisma db seed first');

  let pkg = await prisma.package.findFirst({ where: { slug: 'family-package', deletedAt: null } });
  if (!pkg) pkg = await prisma.package.findFirst({ where: { isActive: true, deletedAt: null } });
  if (!pkg) throw new Error('No package found — run prisma db seed first');

  const guestHash = await argon2.hash(guestPassword);
  const driverHash = await argon2.hash(driverPassword);

  console.log(`Seeding from ${jsonPath}`);
  console.log(
    `hotels=${data.hotels.length} activities=${data.activities.length} guides=${data.guides.length} drivers=${data.drivers.length} clients=${data.clients.length} bookings=${createBookings}`,
  );

  const hotels = await seedVendors(data.hotels.map((h) => ({ ...h, type: 'hotel' })), VendorType.hotel);
  const activities = await seedVendors(
    data.activities.map((a) => ({ ...a, type: 'activity' })),
    VendorType.activity,
  );
  const guides = await seedVendors(data.guides.map((g) => ({ ...g, type: 'guide' })), VendorType.guide);

  const drivers = { created: 0, updated: 0, skipped: 0 };
  for (const row of data.drivers) {
    const r = await upsertDriver(row, driverHash);
    drivers[r]++;
  }

  const clients = { created: 0, updated: 0, skipped: 0 };
  const bookings = { created: 0, skipped: 0 };
  let i = 0;
  for (const row of data.clients) {
    i++;
    try {
      const r = await upsertClient(row, guestHash, admin.id, pkg.id, createBookings);
      clients[r.client]++;
      bookings[r.booking]++;
    } catch (err) {
      clients.skipped++;
      bookings.skipped++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`client fail #${i} ${row.phone} ${row.fullName}: ${msg}`);
    }
    if (i % 25 === 0 || i === data.clients.length) {
      console.log(`clients progress ${i}/${data.clients.length} created=${clients.created} bookings=${bookings.created}`);
    }
  }

  const [vendorCount, byType, clientCount, driverCount, bookingCount] = await Promise.all([
    prisma.vendor.count({ where: { deletedAt: null } }),
    prisma.vendor.groupBy({ by: ['type'], _count: true }),
    prisma.client.count({ where: { deletedAt: null } }),
    prisma.driverProfile.count(),
    prisma.booking.count(),
  ]);

  console.log(
    JSON.stringify(
      { hotels, activities, guides, drivers, clients, bookings, db: { vendorCount, byType, clientCount, driverCount, bookingCount } },
      null,
      2,
    ),
  );
  console.log(`Guest password (for newly hashed clients): ${guestPassword}`);
  console.log(`Driver password: ${driverPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
