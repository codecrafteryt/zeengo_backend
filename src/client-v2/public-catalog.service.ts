import { Injectable } from '@nestjs/common';
import { Prisma, Vendor } from '@prisma/client';
import { AppError } from '../common/errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import type {
  TrainsQuery,
  TransportQuery,
  VendorDetailQuery,
  VendorListQuery,
} from './client-v2.schema';
import {
  nightsBetween,
  toAmount,
  transferPrice,
  unitPrice,
} from './indicative-price';

type Lang = 'en' | 'ar' | 'ru';
export type PublicVendorType = 'hotel' | 'activity' | 'guide' | 'restaurant';

const PRICE_NOTE = 'Indicative — ZEEN confirms the final price';

function images(json: Prisma.JsonValue): string[] {
  return Array.isArray(json)
    ? json.filter(
        (x): x is string => typeof x === 'string' && /^https?:\/\//.test(x),
      )
    : [];
}

function isPublicName(name: string | null | undefined): boolean {
  const n = name?.trim().toLowerCase();
  if (!n) return false;
  return !(
    /^user\d*$/.test(n) ||
    n.startsWith('uservendor') ||
    n === 'driver' ||
    n === 'test'
  );
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Website catalog backed by Vendor, HotelRoom, VehicleClass and TrainRoute. */
@Injectable()
export class PublicCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private publicWhere(type: PublicVendorType): Prisma.VendorWhereInput {
    return {
      type: type,
      isActive: true,
      isPublished: true,
      deletedAt: null,
    };
  }

  title(
    v: Pick<Vendor, 'name' | 'nameEn' | 'nameAr' | 'nameRu'>,
    lang: Lang,
  ): string {
    if (lang === 'ar') return v.nameAr || v.nameEn || v.name;
    if (lang === 'ru') return v.nameRu || v.nameEn || v.name;
    return v.nameEn || v.name;
  }

  private card(
    v: Vendor & { _count?: { rooms: number } },
    lang: Lang,
    ctx: {
      origin?: { lat: number; lng: number };
      nights?: number;
      rooms?: number;
      people?: number;
    },
  ) {
    const gallery = images(v.images);
    const from = toAmount(v.priceFrom);
    const estimate =
      v.priceUnit === 'night' && ctx.nights
        ? unitPrice(v.priceFrom, v.priceCurrency, 'night', {
            nights: ctx.nights,
            rooms: ctx.rooms,
          })
        : v.priceUnit === 'person' && ctx.people
          ? unitPrice(v.priceFrom, v.priceCurrency, 'person', {
              pax: ctx.people,
            })
          : null;
    const distanceKm =
      ctx.origin && v.lat != null && v.lng != null
        ? Math.round(haversineKm(ctx.origin, { lat: v.lat, lng: v.lng }) * 10) /
          10
        : null;
    return {
      id: v.id,
      kind: v.type,
      title: this.title(v, lang),
      titleEn: v.nameEn || v.name,
      titleAr: v.nameAr,
      titleRu: v.nameRu,
      city: v.city ?? 'Moscow',
      area: v.area,
      address: v.address,
      summary: lang === 'ar' ? v.summaryAr || v.summary : v.summary,
      subtitle: v.area || v.address || v.category || v.durationLabel || null,
      category: v.category,
      durationLabel: v.durationLabel,
      languages: v.languages,
      imageUrl: gallery[0] ?? null,
      images: gallery,
      stars: v.stars,
      rating: v.rating != null ? Number(v.rating) : null,
      ratingCount: v.ratingCount,
      lat: v.lat,
      lng: v.lng,
      distanceKm,
      roomsCount: v._count?.rooms ?? 0,
      price: from
        ? {
            from,
            currency: v.priceCurrency,
            unit: v.priceUnit,
            estimate,
            indicative: true as const,
            note: PRICE_NOTE,
          }
        : null,
    };
  }

  async list(type: PublicVendorType, q: VendorListQuery) {
    const lang = q.lang ?? 'en';
    const text = q.q?.trim();
    const where: Prisma.VendorWhereInput = {
      ...this.publicWhere(type),
      ...(q.city ? { city: { equals: q.city, mode: 'insensitive' } } : {}),
      ...(q.category
        ? { category: { equals: q.category, mode: 'insensitive' } }
        : {}),
      ...(q.stars ? { stars: { gte: q.stars } } : {}),
      ...(text
        ? {
            OR: (
              [
                'name',
                'nameEn',
                'nameAr',
                'nameRu',
                'area',
                'address',
                'category',
              ] as const
            ).map((f) => ({
              [f]: { contains: text, mode: 'insensitive' as const },
            })),
          }
        : {}),
    };

    const [rows, facetRows] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        include:
          type === 'hotel'
            ? { _count: { select: { rooms: true } } }
            : undefined,
      }),
      this.prisma.vendor.findMany({
        where: this.publicWhere(type),
        select: { city: true, category: true, name: true },
      }),
    ]);

    const origin =
      q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : undefined;
    const nights =
      q.checkIn && q.checkOut
        ? nightsBetween(q.checkIn, q.checkOut)
        : undefined;
    let cards = rows
      .filter((v) => isPublicName(v.name))
      .map((v) =>
        this.card(v, lang, {
          origin,
          nights,
          rooms: q.rooms,
          people: q.people,
        }),
      );

    if (q.withPhotos) cards = cards.filter((c) => c.images.length > 0);
    if (q.priceMin != null)
      cards = cards.filter((c) => (c.price?.from ?? -1) >= q.priceMin!);
    if (q.priceMax != null)
      cards = cards.filter(
        (c) => c.price != null && c.price.from <= q.priceMax!,
      );

    const priced = (c: (typeof cards)[number]) => c.price?.from ?? null;
    const nullsLast = (a: number | null, b: number | null, dir: 1 | -1) =>
      a == null ? (b == null ? 0 : 1) : b == null ? -1 : (a - b) * dir;
    const score = (c: (typeof cards)[number]) =>
      (c.images.length ? 4 : 0) +
      (c.price ? 2 : 0) +
      (c.lat != null ? 1 : 0) +
      (c.rating ?? 0) / 5 +
      (c.stars ?? 0) / 10;

    const sort = q.sort === 'distance' && !origin ? 'recommended' : q.sort;
    cards.sort((a, b) => {
      switch (sort) {
        case 'price_asc':
          return nullsLast(priced(a), priced(b), 1);
        case 'price_desc':
          return nullsLast(priced(a), priced(b), -1);
        case 'rating':
          return nullsLast(a.rating, b.rating, -1);
        case 'stars':
          return nullsLast(a.stars, b.stars, -1);
        case 'distance':
          return nullsLast(a.distanceKm, b.distanceKm, 1);
        case 'name':
          return a.title.localeCompare(b.title);
        default:
          return score(b) - score(a) || a.title.localeCompare(b.title);
      }
    });

    const page = q.page ?? 1;
    const limit = q.limit ?? 48;
    const visible = facetRows.filter((v) => isPublicName(v.name));
    const countBy = (key: 'city' | 'category') => {
      const m = new Map<string, number>();
      for (const v of visible) {
        const k = v[key]?.trim();
        if (k) m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count }));
    };
    const prices = cards.map(priced).filter((p): p is number => p != null);

    return {
      count: cards.length,
      page,
      limit,
      sort,
      cities: countBy('city'),
      categories: type === 'activity' ? countBy('category') : [],
      priceRange: prices.length
        ? { min: Math.min(...prices), max: Math.max(...prices) }
        : null,
      nights: nights ?? null,
      priceNote: PRICE_NOTE,
      data: cards.slice((page - 1) * limit, page * limit),
    };
  }

  async detail(id: string, q: VendorDetailQuery) {
    const lang = q.lang ?? 'en';
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw AppError.notFound('CATALOG_ITEM_NOT_FOUND', 'Not found');
    const v = await this.prisma.vendor.findFirst({
      where: {
        id,
        isActive: true,
        isPublished: true,
        deletedAt: null,
        type: { in: ['hotel', 'activity', 'guide', 'restaurant'] },
      },
      include: {
        rooms: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });
    if (!v || !isPublicName(v.name)) {
      throw AppError.notFound(
        'CATALOG_ITEM_NOT_FOUND',
        'This listing is not available',
      );
    }

    const nights =
      q.checkIn && q.checkOut
        ? nightsBetween(q.checkIn, q.checkOut)
        : undefined;
    const nearbyRows = await this.prisma.vendor.findMany({
      where: {
        ...this.publicWhere(v.type as PublicVendorType),
        city: v.city,
        id: { not: v.id },
        NOT: { images: { equals: [] } },
      },
      take: 12,
    });
    const origin =
      v.lat != null && v.lng != null ? { lat: v.lat, lng: v.lng } : undefined;
    const nearby = nearbyRows
      .filter((r) => isPublicName(r.name))
      .map((r) => this.card(r, lang, { origin }))
      .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
      .slice(0, 6);

    return {
      ...this.card(v, lang, { nights, rooms: q.rooms, people: q.people }),
      website: v.website,
      yandexMapsUrl: v.yandexMapsUrl,
      cancellationPolicy: v.cancellationPolicy,
      rooms: v.rooms.map((r) => {
        const rate = r.rate ?? v.priceFrom;
        const currency = r.rate ? r.rateCurrency : v.priceCurrency;
        return {
          id: r.id,
          name: lang === 'ru' ? r.nameRu || r.name : r.name,
          sizeM2: r.sizeM2,
          beds: r.beds,
          maxGuests: r.maxGuests,
          breakfast: r.breakfast,
          refundable: r.refundable,
          images: images(r.images),
          price: toAmount(rate)
            ? {
                from: toAmount(rate)!,
                currency,
                unit: 'night',
                /** Hotel "from" price when the room has no own rate. */
                fromHotelRate: !r.rate,
                estimate: nights
                  ? unitPrice(rate, currency, 'night', {
                      nights,
                      rooms: q.rooms,
                    })
                  : null,
                indicative: true as const,
                note: PRICE_NOTE,
              }
            : null,
        };
      }),
      nearby,
    };
  }

  async transport(q: TransportQuery) {
    const lang = q.lang ?? 'en';
    const classes = await this.prisma.vehicleClass.findMany({
      where: {
        isActive: true,
        maxPax: { gte: q.people },
        ...(q.bags != null
          ? { OR: [{ maxBags: null }, { maxBags: { gte: q.bags } }] }
          : {}),
        ...(q.group ? { group: q.group } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    });
    return {
      service: q.service,
      hours: q.service === 'hourly' ? q.hours : null,
      people: q.people,
      priceNote: PRICE_NOTE,
      data: classes.map((c) => ({
        id: c.id,
        key: c.key,
        title: lang === 'ar' ? c.nameAr || c.nameEn : c.nameEn,
        titleEn: c.nameEn,
        group: c.group,
        models: c.models,
        maxPax: c.maxPax,
        maxBags: c.maxBags,
        note: c.note,
        rates: {
          airport: toAmount(c.rateAirport),
          hourly: toAmount(c.rateHourly),
          day8: toAmount(c.rateDay8),
          currency: c.rateCurrency,
        },
        price: transferPrice(c, q.service, q.hours),
      })),
    };
  }

  async trains(q: TrainsQuery) {
    const lang = q.lang ?? 'en';
    const match = (field: 'fromStation' | 'toStation', text?: string) =>
      text
        ? {
            OR: [
              { [field]: { contains: text, mode: 'insensitive' as const } },
              { nameEn: { contains: text, mode: 'insensitive' as const } },
              { nameAr: { contains: text } },
            ],
          }
        : {};
    const rows = await this.prisma.trainRoute.findMany({
      where: {
        isActive: true,
        AND: [match('fromStation', q.from), match('toStation', q.to)],
      },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    });
    return {
      people: q.people,
      priceNote: PRICE_NOTE,
      data: rows.map((t) => ({
        id: t.id,
        key: t.key,
        title: lang === 'ar' ? t.nameAr || t.nameEn : t.nameEn,
        titleEn: t.nameEn,
        fromStation: t.fromStation,
        toStation: t.toStation,
        type: t.type,
        typeLabel: t.typeLabel,
        duration: t.duration,
        departures: t.departures,
        classes: Array.isArray(t.classes) ? t.classes : [],
        km: t.km,
        operator: t.operator,
        price: unitPrice(t.rateFrom, t.rateCurrency, 'person', {
          pax: q.people,
        }),
        rateFrom: toAmount(t.rateFrom),
        currency: t.rateCurrency,
      })),
    };
  }
}
