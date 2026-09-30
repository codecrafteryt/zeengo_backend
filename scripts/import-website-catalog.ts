/**
 * Website catalog import: enriches existing Vendor rows and merges the client
 * prototype data (aLo v4.2.0) into Postgres without creating duplicates.
 *
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/import-website-catalog.ts          # dry run
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/import-website-catalog.ts --commit # write
 *
 * Existing non-empty fields are never overwritten. Every change is listed in
 * docs/CATALOG_IMPORT_REPORT.md (dry run: docs/CATALOG_IMPORT_DRY_RUN.md).
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Prisma, PrismaClient, VendorType } from '@prisma/client';

const COMMIT = process.argv.includes('--commit');
const SOURCE = 'aLo prototype v4.2.0';
const DATA_DIR = join(__dirname, '..', 'prisma', 'data', 'prototype');
const REPORT_PATH = join(
  __dirname,
  '..',
  'docs',
  COMMIT ? 'CATALOG_IMPORT_REPORT.md' : 'CATALOG_IMPORT_DRY_RUN.md',
);

const prisma = new PrismaClient();

type ProtoDb = {
  hotels: ProtoHotel[];
  hotel_rooms: ProtoRoom[];
  vehicle_classes: ProtoVehicleClass[];
  trains: ProtoTrain[];
  guides: ProtoGuide[];
  restaurants: ProtoRestaurant[];
  places: ProtoPlace[];
};
type ProtoHotel = {
  id: string;
  name_ar: string;
  name_en: string;
  area: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  rating_count: number | null;
  images: string[];
};
type ProtoRoom = {
  id: string;
  hotel_id: string;
  name: string;
  name_ru: string | null;
  images: string[];
  url: string | null;
};
type ProtoVehicleClass = {
  id: string;
  name_ar: string;
  name_en: string;
  group: string;
  models: string;
  max_pax: number;
  max_bags: number;
  rate_airport: number;
  rate_hourly: number;
  rate_day8: number;
  rate_currency: string;
  note: string | null;
};
type ProtoTrain = {
  id: string;
  from_station: string;
  to_station: string;
  name_ar: string;
  name_en: string;
  type: string;
  type_label: string;
  duration: string;
  departures: string;
  classes: string[];
  km: number | null;
  rate_from: number | null;
  rate_currency: string;
  operator: string | null;
};
type ProtoGuide = {
  id: string;
  name_ar: string;
  name_en: string;
  group: string;
  duration: string;
  langs: string;
  includes: string;
  rate: number;
  rate_currency: string;
};
type ProtoRestaurant = {
  id: string;
  name_ar: string;
  name_en: string;
  cuisine: string;
  address: string | null;
  tag: string | null;
  halal_claim: string | null;
};
type ProtoPlace = {
  id: string;
  name_ar: string;
  name_en: string;
  category: string;
  lat: number;
  lon: number;
  metro: string | null;
  hours: string | null;
  summary_ar: string | null;
  summary_en: string | null;
  free?: boolean;
};
type ProtoAct = {
  id: string;
  t: string;
  s: string;
  c: string;
  z: string;
  ar: string;
  img: string | null;
};

type VendorRow = Prisma.VendorGetPayload<object>;

const report: Record<string, string[]> = {};
const log = (section: string, line: string) => {
  (report[section] ??= []).push(line);
};

const ARABIC = /[\u0600-\u06FF]/;
const CYRILLIC = /[\u0400-\u04FF]/;

/** "AR | EN", or mixed "Latin words عربي" → separate language parts. */
export function splitNames(raw: string) {
  const parts = raw.includes('|')
    ? raw.split('|').map((p) => p.trim())
    : raw.split(/(?<=[\u0600-\u06FF])\s+(?=[A-Za-z])|(?<=[A-Za-z0-9)])\s+(?=[\u0600-\u06FF])/).map((p) => p.trim());
  let ar: string | null = null;
  let en: string | null = null;
  let ru: string | null = null;
  for (const p of parts.filter(Boolean)) {
    if (ARABIC.test(p) && !ar) ar = p;
    else if (CYRILLIC.test(p) && !ru) ru = p;
    else if (!ARABIC.test(p) && !en) en = p;
  }
  return { ar, en, ru };
}

function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[^a-z0-9\u0600-\u06FF\u0400-\u04FF ]+/g, ' ')
    .replace(/\b(hotel|hotels|moscow|the|and|by|otel|отель|гостиница|москва)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function noteField(notes: string | null, label: RegExp): string | null {
  if (!notes) return null;
  for (const part of notes.split('|').map((p) => p.trim())) {
    const m = part.match(label);
    if (m) return m[1].trim();
  }
  return null;
}

function priceFromNotes(notes: string | null): number | null {
  const v = noteField(notes, /^(?:rate|price)\s*~?\s*([\d\s.,]+)\s*(?:rub|₽)?/i);
  if (!v) return null;
  const n = Number(v.replace(/[\s,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const ACTIVITY_WORDS =
  /\b(excursion|cruise|tour|cuisine|yacht|boat|sightseeing|observation|aqua ?park|water ?park|extreme|karting|ballet|theatre|theater|circus|safari|museum|sessions|quad|zipline|rafting|skating|dolphinarium|zoo|oceanarium|amusement|trampoline|paintball|husky|snowmobile|helicopter|balloon|masterclass|show)\b|فعاليات|جولة|رحلة|كروز|الملاهي|المايه|تجربة|منطاد|مسرح|تزلج/i;
const LODGING_WORDS =
  /\b(hotel|resort|inn|apart|apartments?|hostel|suites?|lodge|residence|guest ?house|glamping|chalet|villa|sanatorium|spa hotel)\b|отель|гостиниц|فندق|منتجع|شاليه/i;

/** Rows imported as hotels whose name clearly describes an activity. */
export function looksLikeActivity(name: string): boolean {
  return ACTIVITY_WORDS.test(name) && !LODGING_WORDS.test(name);
}

function fill<T extends Record<string, unknown>>(
  current: VendorRow,
  patch: T,
): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === '') continue;
    const cur = (current as unknown as Record<string, unknown>)[k];
    const empty =
      cur === null ||
      cur === undefined ||
      cur === '' ||
      (Array.isArray(cur) && cur.length === 0);
    if (empty) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

function matchKey(name: string | null | undefined): string {
  const k = normalize(name);
  return k.length >= 3 ? k : (name ?? '').trim().toLowerCase();
}

/**
 * Name → vendor lookup. The Excel data contains duplicates ("Lotte",
 * "Lotte Hotel Moscow"), so a key can hold several rows; the row that was
 * already enriched (has coordinates) wins, then the oldest row.
 */
class VendorIndex {
  private byKey = new Map<string, VendorRow[]>();
  constructor(rows: VendorRow[]) {
    for (const r of rows) this.add(r);
  }
  add(r: VendorRow) {
    const split = splitNames(r.name);
    const names = [r.name, r.nameEn, r.nameAr, r.nameRu, ...r.name.split('|'), split.ar, split.en, split.ru];
    for (const k of new Set(names.map(matchKey))) {
      if (k.length < 2) continue;
      const key = `${r.type}:${k}`;
      const list = (this.byKey.get(key) ?? []).filter((x) => x.id !== r.id);
      list.push(r);
      this.byKey.set(key, list);
    }
  }
  find(type: VendorType, ...names: (string | null | undefined)[]) {
    for (const n of names) {
      const k = matchKey(n);
      if (k.length < 2) continue;
      const list = this.byKey.get(`${type}:${k}`);
      if (!list?.length) continue;
      return (
        list.find((x) => x.lat != null) ??
        [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
      );
    }
    return null;
  }
  replace(r: VendorRow) {
    this.add(r);
  }
}

let createdCount = 0;
let updatedCount = 0;

async function updateVendor(
  index: VendorIndex,
  row: VendorRow,
  data: Prisma.VendorUpdateInput,
  section: string,
) {
  const keys = Object.keys(data);
  if (!keys.length) return row;
  log(section, `update \`${row.name}\` → ${keys.join(', ')}`);
  updatedCount += 1;
  if (!COMMIT) return row;
  const next = await prisma.vendor.update({ where: { id: row.id }, data });
  index.replace(next);
  return next;
}

async function createVendor(
  index: VendorIndex,
  data: Prisma.VendorCreateInput,
  section: string,
) {
  log(section, `create ${data.type} \`${data.name}\``);
  createdCount += 1;
  if (!COMMIT) {
    return { id: `dry-${createdCount}`, ...data } as unknown as VendorRow;
  }
  const row = await prisma.vendor.create({ data });
  index.add(row);
  return row;
}

async function enrichExisting(index: VendorIndex, rows: VendorRow[]) {
  for (const row of rows) {
    const names = splitNames(row.name);
    const price = priceFromNotes(row.notes);
    const address = noteField(row.notes, /^address:\s*(.+)$/i);
    const patch = fill(row, {
      nameEn: names.en,
      nameAr: names.ar,
      nameRu: names.ru,
      address: address && !/^https?:/i.test(address) ? address : null,
      priceFrom: price,
      priceUnit:
        price == null
          ? null
          : row.type === 'hotel'
            ? 'night'
            : row.type === 'activity'
              ? 'person'
              : null,
    });
    const data: Prisma.VendorUpdateInput = { ...patch };
    if (row.type === 'hotel' && looksLikeActivity(row.name)) {
      data.type = 'activity';
      data.dataSource = [row.dataSource, 'reclassified hotel→activity']
        .filter(Boolean)
        .join('; ');
      if (patch.priceUnit) data.priceUnit = 'person';
      log('Reclassified hotel → activity', `\`${row.name}\` (${row.city ?? '—'})`);
    }
    const noContact =
      !row.phone?.trim() &&
      !row.email?.trim() &&
      !row.notes?.trim() &&
      !row.address?.trim() &&
      row.lat == null &&
      !row.dataSource?.includes(SOURCE);
    if (noContact && (row.type === 'hotel' || row.type === 'activity') && row.isPublished) {
      data.isPublished = false;
      log(
        'Hidden from website (Excel heading or no contact details)',
        `\`${row.name}\` (${row.city ?? '—'})`,
      );
    }
    await updateVendor(index, row, data, 'Existing vendors enriched');
  }
}

async function importHotels(index: VendorIndex, db: ProtoDb) {
  const hotelIdMap = new Map<string, string>();
  for (const h of db.hotels) {
    if (looksLikeActivity(h.name_en)) {
      log('Prototype hotels skipped (not lodging)', `\`${h.name_en}\``);
      continue;
    }
    const fields = {
      nameEn: h.name_en,
      nameAr: ARABIC.test(h.name_ar) ? h.name_ar : null,
      nameRu: CYRILLIC.test(h.name_en) ? h.name_en : null,
      address: h.address,
      lat: h.lat,
      lng: h.lon,
      rating: h.rating,
      ratingCount: h.rating_count,
      website: h.website,
      images: h.images?.length ? h.images : null,
      area: h.area && h.area !== 'hotel' ? h.area : null,
    };
    const existing = index.find('hotel', h.name_en, h.name_ar);
    if (existing) {
      const patch = fill(existing, { ...fields, phone: h.phone });
      const row = await updateVendor(index, existing, patch as Prisma.VendorUpdateInput, 'Prototype hotels merged');
      hotelIdMap.set(h.id, row.id);
    } else {
      const row = await createVendor(
        index,
        {
          name: h.name_en,
          type: 'hotel',
          city: 'Moscow',
          phone: h.phone,
          ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null)),
          dataSource: SOURCE,
        } as Prisma.VendorCreateInput,
        'Prototype hotels created',
      );
      hotelIdMap.set(h.id, row.id);
    }
  }
  return hotelIdMap;
}

async function importRooms(db: ProtoDb, hotelIdMap: Map<string, string>) {
  let order = 0;
  for (const r of db.hotel_rooms) {
    const vendorId = hotelIdMap.get(r.hotel_id);
    if (!vendorId) {
      log('Rooms skipped', `\`${r.name}\` — hotel ${r.hotel_id} not found`);
      continue;
    }
    order += 1;
    const existing = COMMIT
      ? await prisma.hotelRoom.findFirst({ where: { vendorId, name: r.name } })
      : null;
    const data = {
      name: r.name,
      nameRu: r.name_ru,
      images: r.images ?? [],
      sourceUrl: r.url,
      sortOrder: order,
    };
    log('Hotel rooms', `${existing ? 'update' : 'upsert'} \`${r.name}\``);
    if (!COMMIT) continue;
    if (existing) {
      await prisma.hotelRoom.update({ where: { id: existing.id }, data });
    } else {
      await prisma.hotelRoom.create({ data: { ...data, vendorId } });
    }
  }
}

const ACT_CATEGORY: Record<string, string> = {
  fam: 'Family',
  cult: 'Culture',
  adr: 'Adrenaline',
  tour: 'Tours',
  view: 'Views',
  trip: 'Day trips',
  water: 'On the water',
  sport: 'Sport',
  win: 'Winter',
  food: 'Food',
};

async function importActs(index: VendorIndex, acts: ProtoAct[]) {
  for (const a of acts) {
    const fields = {
      nameEn: a.t,
      nameAr: a.ar,
      summary: a.s,
      category: ACT_CATEGORY[a.c] ?? a.c,
      images: a.img ? [a.img] : null,
    };
    const existing = index.find('activity', a.t, a.ar);
    if (existing) {
      await updateVendor(index, existing, fill(existing, fields) as Prisma.VendorUpdateInput, 'Prototype experiences merged');
    } else {
      await createVendor(
        index,
        {
          name: a.t,
          type: 'activity',
          city: 'Moscow',
          ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null)),
          dataSource: SOURCE,
        } as Prisma.VendorCreateInput,
        'Prototype experiences created',
      );
    }
  }
}

async function importGuides(index: VendorIndex, guides: ProtoGuide[]) {
  for (const g of guides) {
    const fields = {
      nameEn: g.name_en,
      nameAr: g.name_ar,
      summary: g.includes,
      durationLabel: g.duration,
      languages: g.langs,
      category: g.group,
      priceFrom: g.rate,
      priceCurrency: g.rate_currency,
      priceUnit: 'service',
    };
    const existing = index.find('guide', g.name_en, g.name_ar);
    if (existing) {
      await updateVendor(index, existing, fill(existing, fields) as Prisma.VendorUpdateInput, 'Guide services merged');
    } else {
      await createVendor(
        index,
        { name: g.name_en, type: 'guide', city: 'Moscow', ...fields, dataSource: SOURCE },
        'Guide services created',
      );
    }
  }
}

async function importRestaurants(index: VendorIndex, rows: ProtoRestaurant[]) {
  for (const r of rows) {
    const fields = {
      nameEn: r.name_en,
      nameAr: ARABIC.test(r.name_ar) ? r.name_ar : null,
      nameRu: CYRILLIC.test(r.name_ar) ? r.name_ar : null,
      summary: r.cuisine,
      address: r.address,
      category: r.tag,
    };
    const existing = index.find('restaurant', r.name_en, r.name_ar);
    if (existing) {
      await updateVendor(index, existing, fill(existing, fields) as Prisma.VendorUpdateInput, 'Restaurants merged');
    } else {
      await createVendor(
        index,
        {
          name: r.name_en,
          type: 'restaurant',
          city: 'Moscow',
          ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null)),
          notes: r.halal_claim ? `Halal: ${r.halal_claim}` : null,
          dataSource: SOURCE,
        } as Prisma.VendorCreateInput,
        'Restaurants created',
      );
    }
  }
}

async function importVehicleClasses(rows: ProtoVehicleClass[]) {
  let order = 0;
  for (const v of rows) {
    order += 1;
    const key = v.id.replace(/^vc_/, '');
    const data = {
      nameEn: v.name_en,
      nameAr: v.name_ar,
      group: v.group,
      models: v.models,
      maxPax: v.max_pax,
      maxBags: v.max_bags,
      rateAirport: v.rate_airport,
      rateHourly: v.rate_hourly,
      rateDay8: v.rate_day8,
      rateCurrency: v.rate_currency || 'RUB',
      note: v.note,
      sortOrder: order,
    };
    log('Vehicle classes', `upsert \`${key}\` ${v.name_en}`);
    if (COMMIT) {
      await prisma.vehicleClass.upsert({ where: { key }, create: { key, ...data }, update: data });
    }
  }
}

async function importTrains(rows: ProtoTrain[]) {
  let order = 0;
  for (const t of rows) {
    order += 1;
    const key = t.id.replace(/^tr_/, '');
    const data = {
      fromStation: t.from_station,
      toStation: t.to_station,
      nameEn: t.name_en,
      nameAr: t.name_ar,
      type: t.type,
      typeLabel: t.type_label,
      duration: t.duration,
      departures: t.departures,
      classes: t.classes ?? [],
      km: t.km,
      rateFrom: t.rate_from,
      rateCurrency: t.rate_currency || 'RUB',
      operator: t.operator,
      sortOrder: order,
    };
    log('Train routes', `upsert \`${key}\` ${t.name_en}`);
    if (COMMIT) {
      await prisma.trainRoute.upsert({ where: { key }, create: { key, ...data }, update: data });
    }
  }
}

const PLACE_CATEGORY: Record<string, string> = {
  sight: 'Places',
  mosque: 'Mosque',
  park: 'Places',
  museum: 'Places',
  shopping: 'Shopping',
  food: 'Food',
  exchange: 'Exchange',
  pharmacy: 'Pharmacy',
  supermarket: 'Supermarket',
  metro: 'Metro',
  kids: 'Kids',
};

async function importPlaces(rows: ProtoPlace[]) {
  const existing = await prisma.discoveryPlace.findMany();
  const byTitle = new Map(existing.map((p) => [normalize(p.title), p]));
  let order = 100;
  for (const p of rows) {
    const slug = p.id.replace(/^pl_/, '');
    const hit = byTitle.get(normalize(p.name_en)) ?? existing.find((e) => e.slug === slug);
    if (hit) {
      log('Places', `exists \`${p.name_en}\` (kept)`);
      continue;
    }
    order += 1;
    log('Places', `create \`${p.name_en}\``);
    if (!COMMIT) continue;
    await prisma.discoveryPlace.create({
      data: {
        slug,
        title: p.name_en,
        description: p.summary_en ?? '',
        arabicDescription: p.summary_ar,
        area: p.metro ? `Metro ${p.metro}` : null,
        category: PLACE_CATEGORY[p.category] ?? 'Places',
        lat: p.lat,
        lng: p.lon,
        openLabel: p.hours,
        isFree: p.free ?? false,
        sortOrder: order,
      },
    });
  }
}

function writeReport() {
  const lines = [
    '# Website catalog import report',
    '',
    `Mode: **${COMMIT ? 'COMMITTED' : 'DRY RUN'}** · ${new Date().toISOString()}`,
    '',
    `Source: \`prisma/data/prototype/\` (${SOURCE}) + existing Excel vendor rows.`,
    'Existing non-empty fields are never overwritten.',
    '',
    `Vendors created: ${createdCount} · vendors updated: ${updatedCount}`,
    '',
  ];
  for (const [section, items] of Object.entries(report)) {
    lines.push(`## ${section} (${items.length})`, '');
    for (const i of items) lines.push(`- ${i}`);
    lines.push('');
  }
  writeFileSync(REPORT_PATH, lines.join('\n'));
}

async function main() {
  const db = JSON.parse(
    readFileSync(join(DATA_DIR, 'alo-v4.2.0-db.json'), 'utf8'),
  ) as ProtoDb;
  const acts = JSON.parse(
    readFileSync(join(DATA_DIR, 'alo-v4.2.0-acts.json'), 'utf8'),
  ) as ProtoAct[];

  const vendors = await prisma.vendor.findMany({
    where: {
      deletedAt: null,
      type: { in: ['hotel', 'activity', 'guide', 'restaurant'] },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const index = new VendorIndex(vendors);

  await enrichExisting(index, vendors);
  const hotelIdMap = await importHotels(index, db);
  await importRooms(db, hotelIdMap);
  await importActs(index, acts);
  await importGuides(index, db.guides);
  await importRestaurants(index, db.restaurants);
  await importVehicleClasses(db.vehicle_classes);
  await importTrains(db.trains);
  await importPlaces(db.places);

  writeReport();
  console.log(
    `${COMMIT ? 'Committed' : 'Dry run'}: created ${createdCount}, updated ${updatedCount}. Report: ${REPORT_PATH}`,
  );
  for (const [section, items] of Object.entries(report)) {
    console.log(`  ${section}: ${items.length}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
