import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError } from '../common/errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CatalogQuery,
  DestinationsQuery,
  NearbyPlacesQuery,
  SearchQuery,
} from './client-v2.schema';

const RED_SQUARE = { lat: 55.7539, lng: 37.6208 };

@Injectable()
export class ClientV2Service {
  constructor(private readonly prisma: PrismaService) {}

  async homeFeed() {
    const vendorPublic = {
      isActive: true,
      deletedAt: null,
    } as const;

    const [chips, places, hotelCount, activityCount, guideCount, restaurantCount, featuredHotels, featuredActivities] =
      await Promise.all([
        this.prisma.discoveryChip.findMany({
          where: {
            isPublished: true,
            kind: {
              in: [
                'homeQuick',
                'homeCategory',
                'suitMood',
                'service',
                'exploreFilter',
              ],
            },
          },
          orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
        }),
        this.prisma.discoveryPlace.findMany({
          where: { isPublished: true, homeRail: { not: null } },
          orderBy: [{ homeRail: 'asc' }, { sortOrder: 'asc' }],
        }),
        this.prisma.vendor.count({
          where: { ...vendorPublic, type: 'hotel' },
        }),
        this.prisma.vendor.count({
          where: { ...vendorPublic, type: 'activity' },
        }),
        this.prisma.vendor.count({
          where: { ...vendorPublic, type: 'guide' },
        }),
        this.prisma.vendor.count({
          where: { ...vendorPublic, type: 'restaurant' },
        }),
        this.prisma.vendor.findMany({
          where: {
            ...vendorPublic,
            type: 'hotel',
            OR: [
              { city: { contains: 'Moscow', mode: 'insensitive' } },
              { city: { contains: 'Москв', mode: 'insensitive' } },
            ],
          },
          orderBy: { name: 'asc' },
          take: 12,
        }),
        this.prisma.vendor.findMany({
          where: { ...vendorPublic, type: 'activity' },
          orderBy: { name: 'asc' },
          take: 12,
        }),
      ]);

    const byKind = (kind: string) =>
      chips
        .filter((c) => c.kind === kind)
        .map((c) => ({
          id: c.key,
          label: c.label,
          subtitle: c.subtitle,
          iconKey: c.iconKey,
          meta: c.meta,
        }));

    const rail = (key: string) =>
      places
        .filter((p) => p.homeRail === key)
        .map((p) => this.mapHomeCard(p));

    const catalogStats = {
      hotels: hotelCount,
      activities: activityCount,
      guides: guideCount,
      restaurants: restaurantCount,
    };

    const catalogServices = [
      {
        id: 'acts',
        label: 'Things to do',
        subtitle: `${activityCount} activities`,
        iconKey: 'acts',
        meta: null,
      },
      {
        id: 'hotels',
        label: 'Hotels',
        subtitle: `${hotelCount} hotels`,
        iconKey: 'hotels',
        meta: null,
      },
      {
        id: 'cars',
        label: 'Cars & drivers',
        subtitle: 'Live drivers + vehicle classes',
        iconKey: 'cars',
        meta: null,
      },
      {
        id: 'guides',
        label: 'Guide service',
        subtitle: `${guideCount} guides`,
        iconKey: 'guides',
        meta: null,
      },
      {
        id: 'money',
        label: 'Money now',
        subtitle: 'Live ₽ rates & paying',
        iconKey: 'money',
        meta: null,
      },
      {
        id: 'now',
        label: 'Happening now',
        subtitle: 'Around you in Moscow',
        iconKey: 'now',
        meta: null,
      },
    ];

    const chipServices = byKind('service');
    const services =
      chipServices.length > 0
        ? chipServices.map((c) => {
            if (c.id === 'hotels' || c.id === 'stays' || /hotel/i.test(c.label)) {
              return { ...c, subtitle: `${hotelCount} hotels` };
            }
            if (c.id === 'acts' || c.id === 'activities' || /thing|activ/i.test(c.label)) {
              return {
                ...c,
                subtitle: `${activityCount} activities`,
              };
            }
            if (c.id === 'guides' || /guide/i.test(c.label)) {
              return { ...c, subtitle: `${guideCount} guides` };
            }
            return c;
          })
        : catalogServices;

    return {
      quickChips: byKind('homeQuick').map((c) => c.label),
      categories: byKind('homeCategory'),
      suitYou: byKind('suitMood'),
      services,
      exploreFilters: byKind('exploreFilter'),
      catalogStats,
      featuredHotels: featuredHotels
        .filter((v) => this.isPublicVendorName(v.name))
        .map((v) => ({
          id: v.id,
          title: v.name,
          subtitle: this.vendorSubtitle(v.notes, 'Hotel · request with ZN'),
          area: v.city ?? 'Moscow',
          category: 'Stay',
          imageUrl: null as string | null,
          badge: v.city ?? 'Hotel',
        })),
      featuredActivities: featuredActivities
        .filter((v) => this.isPublicVendorName(v.name))
        .map((v) => ({
          id: v.id,
          title: v.name,
          subtitle: this.vendorSubtitle(v.notes, 'Activity · request with ZN'),
          area: v.city ?? 'Moscow',
          category: 'Activity',
          imageUrl: null as string | null,
          badge: v.city ?? 'Activity',
        })),
      moscowNow: rail('moscowNow'),
      closeToCentre: rail('closeToCentre'),
      firstTime: rail('firstTime'),
      withKids: rail('withKids'),
      food: places
        .filter((p) => p.homeRail === 'food')
        .map((p) => ({
          id: p.slug,
          title: p.title,
          description: p.foodDescription ?? p.description,
          location: p.foodLocation ?? p.area ?? '',
          halalFriendly: p.halalFriendly,
          imageUrl: p.imageUrl,
        })),
    };
  }

  async listPlaces(query: NearbyPlacesQuery) {
    const originLat = query.lat ?? RED_SQUARE.lat;
    const originLng = query.lng ?? RED_SQUARE.lng;
    const categoryKey = query.category?.trim().toLowerCase() || null;
    const isVendorCategory =
      categoryKey === 'hotels' ||
      categoryKey === 'hotel' ||
      categoryKey === 'activities' ||
      categoryKey === 'activity' ||
      categoryKey === 'acts' ||
      categoryKey === 'guides' ||
      categoryKey === 'guide';

    const vendorPublic = { isActive: true, deletedAt: null } as const;

    const [placeRows, chipCategories, hotels, activities, guides] =
      await Promise.all([
        isVendorCategory
          ? Promise.resolve([])
          : this.prisma.discoveryPlace.findMany({
              where: {
                isPublished: true,
                ...(query.section ? { aroundSection: query.section } : {}),
                ...(query.homeRail ? { homeRail: query.homeRail } : {}),
                ...(categoryKey
                  ? {
                      OR: [
                        {
                          category: {
                            equals: categoryKey,
                            mode: 'insensitive' as const,
                          },
                        },
                        {
                          category: {
                            equals: this.categoryLabel(categoryKey),
                            mode: 'insensitive' as const,
                          },
                        },
                      ],
                    }
                  : {}),
              },
              orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
            }),
        this.prisma.discoveryChip.findMany({
          where: { kind: 'aroundCategory', isPublished: true },
          orderBy: { sortOrder: 'asc' },
        }),
        this.prisma.vendor.findMany({
          where: { ...vendorPublic, type: 'hotel' },
          orderBy: [{ city: 'asc' }, { name: 'asc' }],
          take: 80,
        }),
        this.prisma.vendor.findMany({
          where: { ...vendorPublic, type: 'activity' },
          orderBy: [{ city: 'asc' }, { name: 'asc' }],
          take: 80,
        }),
        this.prisma.vendor.findMany({
          where: { ...vendorPublic, type: 'guide' },
          orderBy: [{ city: 'asc' }, { name: 'asc' }],
          take: 40,
        }),
      ]);

    const mapped = placeRows
      .map((p) => this.mapAroundPlace(p, originLat, originLng))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    const mapVendors = (
      rows: Array<{
        id: string;
        name: string;
        type: string;
        city: string | null;
        phone: string | null;
        notes: string | null;
      }>,
      section: string,
      badge: string,
    ) =>
      rows
        .filter((v) => this.isPublicVendorName(v.name))
        .map((v) =>
          this.mapVendorAround(v, originLat, originLng, section, badge),
        );

    let excelHotels = mapVendors(hotels, 'excelHotels', 'Hotel');
    let excelActivities = mapVendors(activities, 'excelActivities', 'Activity');
    let excelGuides = mapVendors(guides, 'excelGuides', 'Guide');

    if (
      categoryKey === 'hotels' ||
      categoryKey === 'hotel'
    ) {
      excelActivities = [];
      excelGuides = [];
    } else if (
      categoryKey === 'activities' ||
      categoryKey === 'activity' ||
      categoryKey === 'acts'
    ) {
      excelHotels = [];
      excelGuides = [];
    } else if (categoryKey === 'guides' || categoryKey === 'guide') {
      excelHotels = [];
      excelActivities = [];
    } else if (categoryKey) {
      // Discovery category selected — hide Excel rails
      excelHotels = [];
      excelActivities = [];
      excelGuides = [];
    }

    const catalogCategories = [
      { id: 'hotels', label: 'Hotels', iconKey: 'hotels' },
      { id: 'activities', label: 'Activities', iconKey: 'acts' },
      { id: 'guides', label: 'Guides', iconKey: 'guides' },
    ];

    const categories = [
      ...catalogCategories,
      ...chipCategories.map((c) => ({
        id: c.key,
        label: c.label,
        iconKey: c.iconKey,
      })),
    ];

    return {
      origin: {
        lat: originLat,
        lng: originLng,
        label:
          query.lat != null && query.lng != null ? 'Your location' : 'Red Square',
      },
      categories,
      sections: {
        under6: mapped.filter((p) => p.section === 'under6'),
        shortWalk: mapped.filter((p) => p.section === 'shortWalk'),
        shortRide: mapped.filter((p) => p.section === 'shortRide'),
        excelHotels,
        excelActivities,
        excelGuides,
      },
      data: [
        ...mapped,
        ...excelHotels,
        ...excelActivities,
        ...excelGuides,
      ],
    };
  }

  async getPlace(slugOrId: string) {
    const key = slugOrId.trim();
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        key,
      );

    // Only match UUID `id` when the path param is a real UUID — Postgres
    // rejects slug strings like "patriot" in a UUID column (P2023).
    const place = await this.prisma.discoveryPlace.findFirst({
      where: {
        isPublished: true,
        OR: isUuid ? [{ slug: key }, { id: key }] : [{ slug: key }],
      },
    });
    if (place) {
      return this.mapAroundPlace(place, RED_SQUARE.lat, RED_SQUARE.lng);
    }

    // Explore cards use destination slugs but share the /places/:id detail route.
    const destination = await this.prisma.discoveryDestination.findFirst({
      where: {
        isPublished: true,
        OR: isUuid ? [{ slug: key }, { id: key }] : [{ slug: key }],
      },
    });
    if (destination) {
      return this.mapDestinationDetail(destination);
    }

    // Hotels / restaurants from the Vendor catalog (Food/Stay cards + trip stops).
    if (isUuid) {
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: key, isActive: true, deletedAt: null },
      });
      if (vendor && this.isPublicVendorName(vendor.name)) {
        return this.mapVendorDetail(vendor);
      }

      // Legacy My Trip links used itinerary activity ids as /places/:id —
      // resolve to the linked public vendor when present.
      const itineraryItem = await this.prisma.itineraryItem.findFirst({
        where: { id: key, vendorId: { not: null } },
        include: { vendor: true },
      });
      if (
        itineraryItem?.vendor &&
        itineraryItem.vendor.isActive &&
        !itineraryItem.vendor.deletedAt &&
        this.isPublicVendorName(itineraryItem.vendor.name)
      ) {
        return this.mapVendorDetail(itineraryItem.vendor);
      }
    }

    throw AppError.notFound('PLACE_NOT_FOUND', 'Place not found');
  }

  async listDestinations(query: DestinationsQuery) {
    const filterId = query.filter?.trim() || null;
    const vendorPublic = { isActive: true, deletedAt: null } as const;

    const catalogFilters = [
      {
        id: 'hotels',
        label: 'Hotels',
        statusTitle: 'Hotels',
      },
      {
        id: 'activities',
        label: 'Activities',
        statusTitle: 'Activities',
      },
      {
        id: 'guides',
        label: 'Guides',
        statusTitle: 'Guides',
      },
      {
        id: 'cities',
        label: 'Cities',
        statusTitle: 'Cities',
      },
    ];

    if (
      filterId === 'hotels' ||
      filterId === 'activities' ||
      filterId === 'guides'
    ) {
      const type =
        filterId === 'hotels'
          ? 'hotel'
          : filterId === 'activities'
            ? 'activity'
            : 'guide';
      const rows = await this.prisma.vendor.findMany({
        where: { ...vendorPublic, type },
        orderBy: [{ city: 'asc' }, { name: 'asc' }],
        take: 120,
      });
      const data = rows
        .filter((v) => this.isPublicVendorName(v.name))
        .map((v) => ({
          id: v.id,
          title: v.name,
          tags: [v.city ?? 'Russia', type],
          imageUrl: null as string | null,
          usePlaceholder: true,
          nearMe: /moscow|москв/i.test(v.city ?? ''),
          today: true,
          daylight: true,
          subtitle: this.vendorSubtitle(
            v.notes,
            `${v.city ?? 'Russia'}`,
          ),
          area: v.city ?? 'Russia',
          kind: 'vendor' as const,
        }));
      const active = catalogFilters.find((f) => f.id === filterId);
      return {
        filters: [
          ...catalogFilters,
          ...(
            await this.prisma.discoveryChip.findMany({
              where: { kind: 'exploreFilter', isPublished: true },
              orderBy: { sortOrder: 'asc' },
            })
          ).map((f) => ({
            id: f.key,
            label: f.label,
            statusTitle: f.subtitle ?? undefined,
          })),
        ],
        filter: filterId,
        statusTitle: active?.statusTitle ?? active?.label ?? 'Catalog',
        matchCount: data.length,
        data,
      };
    }

    if (filterId === 'cities') {
      const cityRows = await this.prisma.vendor.findMany({
        where: {
          ...vendorPublic,
          type: { in: ['hotel', 'activity', 'guide'] },
          city: { not: null },
        },
        select: { city: true, type: true },
      });
      const counts = new Map<string, { hotels: number; activities: number; guides: number }>();
      for (const row of cityRows) {
        const city = row.city?.trim();
        if (!city) continue;
        const cur = counts.get(city) ?? {
          hotels: 0,
          activities: 0,
          guides: 0,
        };
        if (row.type === 'hotel') cur.hotels += 1;
        else if (row.type === 'activity') cur.activities += 1;
        else if (row.type === 'guide') cur.guides += 1;
        counts.set(city, cur);
      }
      const data = [...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([city, c]) => ({
          id: `city:${encodeURIComponent(city)}`,
          title: city,
          tags: ['City'],
          imageUrl: null as string | null,
          usePlaceholder: true,
          nearMe: /moscow|москв/i.test(city),
          today: true,
          daylight: true,
          subtitle: [
            c.hotels ? `${c.hotels} hotels` : null,
            c.activities ? `${c.activities} activities` : null,
            c.guides ? `${c.guides} guides` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          area: 'Russia',
          kind: 'city' as const,
          href: `/stays?city=${encodeURIComponent(city)}`,
        }));
      return {
        filters: [
          ...catalogFilters,
          ...(
            await this.prisma.discoveryChip.findMany({
              where: { kind: 'exploreFilter', isPublished: true },
              orderBy: { sortOrder: 'asc' },
            })
          ).map((f) => ({
            id: f.key,
            label: f.label,
            statusTitle: f.subtitle ?? undefined,
          })),
        ],
        filter: filterId,
        statusTitle: 'Cities',
        matchCount: data.length,
        data,
      };
    }

    const [filters, rows, hotelSample, activitySample] = await Promise.all([
      this.prisma.discoveryChip.findMany({
        where: { kind: 'exploreFilter', isPublished: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.discoveryDestination.findMany({
        where: { isPublished: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.vendor.findMany({
        where: { ...vendorPublic, type: 'hotel' },
        orderBy: { name: 'asc' },
        take: 24,
      }),
      this.prisma.vendor.findMany({
        where: { ...vendorPublic, type: 'activity' },
        orderBy: { name: 'asc' },
        take: 24,
      }),
    ]);

    const destinations = rows
      .map((d) => ({
        id: d.slug,
        title: d.title,
        tags: d.tags,
        imageUrl: d.imageUrl,
        usePlaceholder: d.usePlaceholder,
        nearMe: d.nearMe,
        today: d.today,
        daylight: d.daylight,
        subtitle: d.tags.join(' · ') || 'Explore',
        area: d.tags?.[0] ?? 'Russia',
        kind: 'destination' as const,
      }))
      .filter((d) => this.matchesExploreFilter(d, filterId));

    const excelCards = filterId
      ? []
      : [
          ...hotelSample
            .filter((v) => this.isPublicVendorName(v.name))
            .map((v) => ({
              id: v.id,
              title: v.name,
              tags: [v.city ?? 'Russia', 'hotel'],
              imageUrl: null as string | null,
              usePlaceholder: true,
              nearMe: /moscow|москв/i.test(v.city ?? ''),
              today: true,
              daylight: true,
              subtitle: this.vendorSubtitle(
                v.notes,
                `${v.city ?? 'Russia'} · Hotel`,
              ),
              area: v.city ?? 'Russia',
              kind: 'vendor' as const,
            })),
          ...activitySample
            .filter((v) => this.isPublicVendorName(v.name))
            .map((v) => ({
              id: v.id,
              title: v.name,
              tags: [v.city ?? 'Russia', 'activity'],
              imageUrl: null as string | null,
              usePlaceholder: true,
              nearMe: /moscow|москв/i.test(v.city ?? ''),
              today: true,
              daylight: true,
              subtitle: this.vendorSubtitle(
                v.notes,
                `${v.city ?? 'Russia'} · Activity`,
              ),
              area: v.city ?? 'Russia',
              kind: 'vendor' as const,
            })),
        ];

    const data = [...destinations, ...excelCards];
    const active = [...catalogFilters, ...filters.map((f) => ({
      id: f.key,
      label: f.label,
      statusTitle: f.subtitle ?? undefined,
    }))].find((f) => f.id === filterId);

    return {
      filters: [
        ...catalogFilters,
        ...filters.map((f) => ({
          id: f.key,
          label: f.label,
          statusTitle: f.subtitle ?? undefined,
        })),
      ],
      filter: filterId,
      statusTitle:
        active?.statusTitle ??
        active?.label ??
        (filterId ? 'Filtered' : 'All'),
      matchCount: data.length,
      data,
    };
  }

  async trip() {
    const days = await this.prisma.discoveryTripDay.findMany({
      orderBy: { dayNumber: 'asc' },
      include: {
        stops: { orderBy: { sortOrder: 'asc' } },
      },
    });

    return {
      tripDaysCount: days.length,
      subtitle: 'Kids, food and the nearest mosque for every day.',
      days: days.map((d) => ({
        dayNumber: d.dayNumber,
        title: d.title,
        mosqueKm: d.mosqueKm,
        stops: d.stops.map((s) => ({
          title: s.title,
          subtitle: s.subtitle,
          lat: s.lat,
          lng: s.lng,
        })),
      })),
    };
  }

  /** Public hotel catalog from Vendor (type=hotel) — Excel master data. */
  async listHotels(query: CatalogQuery) {
    return this.listVendorCatalog('hotel', query, {
      kind: 'hotel',
      fallbackSubtitle: 'Arabic-speaking desk · request with your ZN code',
      ctaHint:
        'Request a stay quote with your ZN code — ZEEN desk confirms on your booking',
      extra: (v) => ({
        contactName: v.contactName,
        people: query.people ?? null,
        date: query.date ?? null,
        from: query.from ?? null,
        to: query.to ?? null,
      }),
    });
  }

  /** Public activities from Vendor (type=activity) — Excel master data. */
  async listActivities(query: CatalogQuery) {
    return this.listVendorCatalog('activity', query, {
      kind: 'activity',
      fallbackSubtitle: 'Experience · request with your ZN code',
      ctaHint:
        'Request this activity with your ZN code — ZEEN desk adds it to your trip',
    });
  }

  /** Public guides from Vendor (type=guide) — Excel master data. */
  async listGuides(query: CatalogQuery) {
    return this.listVendorCatalog('guide', query, {
      kind: 'guide',
      fallbackSubtitle: 'Arabic-speaking guide · book via ZEEN',
      ctaHint:
        'Request a guide with your ZN code — ZEEN desk confirms on your booking',
    });
  }

  /** Restaurants from Vendor + Discovery food places. */
  async listRestaurants(query: CatalogQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 48;
    const [vendors, places] = await Promise.all([
      this.prisma.vendor.findMany({
        where: {
          type: 'restaurant',
          isActive: true,
          deletedAt: null,
          ...(query.q
            ? {
                OR: [
                  {
                    name: { contains: query.q, mode: 'insensitive' as const },
                  },
                  {
                    notes: { contains: query.q, mode: 'insensitive' as const },
                  },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.discoveryPlace.findMany({
        where: {
          isPublished: true,
          AND: [
            {
              OR: [
                { category: { equals: 'Food', mode: 'insensitive' } },
                { homeRail: 'food' },
                { halalFriendly: true },
              ],
            },
            ...(query.q
              ? [
                  {
                    OR: [
                      {
                        title: {
                          contains: query.q,
                          mode: 'insensitive' as const,
                        },
                      },
                      {
                        description: {
                          contains: query.q,
                          mode: 'insensitive' as const,
                        },
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    const fromVendors = vendors
      .filter((v) => this.isPublicVendorName(v.name))
      .map((v) => ({
        id: v.id,
        kind: 'restaurant' as const,
        title: v.name,
        city: v.city ?? 'Moscow',
        subtitle: this.vendorSubtitle(v.notes, 'Restaurant · book via ZEEN'),
        phone: v.phone,
        imageUrl: null as string | null,
        halalFriendly: /halal/i.test(`${v.name} ${v.notes ?? ''}`),
        slug: null as string | null,
      }));

    const fromPlaces = places.map((p) => ({
      id: p.id,
      kind: 'place' as const,
      title: p.title,
      city: p.area ?? 'Moscow',
      subtitle: p.foodDescription ?? p.description,
      phone: null as string | null,
      imageUrl: p.imageUrl,
      halalFriendly: p.halalFriendly,
      slug: p.slug,
    }));

    const all = [...fromVendors, ...fromPlaces];
    const cities = [
      ...new Set(all.map((r) => r.city).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
    const filtered = query.city
      ? all.filter((r) =>
          r.city.toLowerCase().includes(query.city!.toLowerCase()),
        )
      : all;
    const skip = (page - 1) * limit;
    const data = filtered.slice(skip, skip + limit);

    return {
      query,
      count: filtered.length,
      page,
      limit,
      cities,
      data,
    };
  }

  private async listVendorCatalog(
    type: 'hotel' | 'activity' | 'guide',
    query: CatalogQuery,
    opts: {
      kind: string;
      fallbackSubtitle: string;
      ctaHint: string;
      extra?: (v: {
        contactName: string | null;
      }) => Record<string, unknown>;
    },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 48;
    const where = {
      type,
      isActive: true,
      deletedAt: null,
      ...(query.city
        ? { city: { contains: query.city, mode: 'insensitive' as const } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { city: { contains: query.q, mode: 'insensitive' as const } },
              { notes: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total, cityRows] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        orderBy: [{ city: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vendor.count({ where }),
      this.prisma.vendor.findMany({
        where: {
          type,
          isActive: true,
          deletedAt: null,
          ...(query.q
            ? {
                OR: [
                  {
                    name: { contains: query.q, mode: 'insensitive' as const },
                  },
                  {
                    city: { contains: query.q, mode: 'insensitive' as const },
                  },
                  {
                    notes: { contains: query.q, mode: 'insensitive' as const },
                  },
                ],
              }
            : {}),
        },
        select: { city: true, name: true },
      }),
    ]);

    const cities = [
      ...new Set(
        cityRows
          .filter((v) => this.isPublicVendorName(v.name))
          .map((v) => (v.city?.trim() ? v.city.trim() : 'Unknown'))
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));

    const data = rows
      .filter((v) => this.isPublicVendorName(v.name))
      .map((v) => ({
        id: v.id,
        kind: opts.kind,
        title: v.name,
        city: v.city ?? 'Moscow',
        subtitle: this.vendorSubtitle(v.notes, opts.fallbackSubtitle),
        phone: v.phone,
        ...(opts.extra ? opts.extra(v) : {}),
      }));

    return {
      query,
      count: total,
      page,
      limit,
      cities,
      data,
      ctaHint: opts.ctaHint,
    };
  }

  /**
   * Cars with driver: live DriverProfile rows + prototype vehicle classes
   * (so Move always has bookable options like the HTML app).
   */
  async listCars(query: CatalogQuery) {
    const people = query.people ?? 2;
    const drivers = await this.prisma.driverProfile.findMany({
      where: { status: { in: ['available', 'en_route'] } },
      include: {
        user: { select: { fullName: true, phone: true } },
      },
      orderBy: [{ rating: 'desc' }, { tripsCount: 'desc' }],
    });

    const live = drivers
      .filter((d) => this.isPublicVendorName(d.user.fullName))
      .map((d) => {
        const vehicle = [d.vehicleMake, d.vehicleModel]
          .filter(Boolean)
          .join(' ');
        return {
          id: d.id,
          kind: 'driver' as const,
          title: d.user.fullName || 'Driver',
          subtitle: vehicle || 'Private car with driver',
          vehicle: vehicle || null,
          status: d.status,
          rating: Number(d.rating) || null,
          tripsCount: d.tripsCount,
          phone: d.whatsapp || d.user.phone,
          people,
          date: query.date ?? null,
          from: query.from ?? 'Your location in Moscow',
          to: query.to ?? null,
          priceLabel: null as string | null,
        };
      });

    const classes = this.carClasses()
      .filter((c) => c.pax >= Math.min(people, 6))
      .map((c) => ({
        id: c.id,
        kind: 'class' as const,
        title: c.title,
        subtitle: `${c.models} · up to ${c.pax} people`,
        vehicle: c.models,
        status: 'available' as const,
        rating: null as number | null,
        tripsCount: 0,
        phone: null as string | null,
        people,
        date: query.date ?? null,
        from: query.from ?? 'Your location in Moscow',
        to: query.to ?? null,
        priceLabel: `from ₽${c.hr.toLocaleString('en-US')}/hr`,
      }));

    const data = [...live, ...classes];
    return {
      query: {
        ...query,
        from: query.from ?? 'Your location in Moscow',
        people,
      },
      count: data.length,
      data,
      ctaHint:
        'Select a driver with your ZN code — status updates on My trip after ZEEN assigns and the driver completes',
    };
  }

  /** Unified search across places, destinations, hotels, restaurants, activities. */
  async search(query: SearchQuery) {
    const q = query.q.trim();
    const [places, destinations, hotels, restaurants, activities, guides] =
      await Promise.all([
        this.prisma.discoveryPlace.findMany({
          where: {
            isPublished: true,
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              { area: { contains: q, mode: 'insensitive' } },
              { category: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: 20,
          orderBy: { sortOrder: 'asc' },
        }),
        this.prisma.discoveryDestination.findMany({
          where: {
            isPublished: true,
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: 20,
          orderBy: { sortOrder: 'asc' },
        }),
        this.listHotels({ q, page: 1, limit: 20 }),
        this.listRestaurants({ q, page: 1, limit: 20 }),
        this.listActivities({ q, page: 1, limit: 20 }),
        this.listGuides({ q, page: 1, limit: 20 }),
      ]);

    return {
      q,
      places: places.map((p) => ({
        id: p.slug,
        kind: 'place' as const,
        title: p.title,
        subtitle: p.area || p.subtitle || p.category,
        imageUrl: p.imageUrl,
        to: `/places/${encodeURIComponent(p.slug)}`,
      })),
      destinations: destinations.map((d) => ({
        id: d.slug,
        kind: 'destination' as const,
        title: d.title,
        subtitle: d.tags.join(' · ') || 'Explore',
        imageUrl: d.imageUrl,
        to: `/places/${encodeURIComponent(d.slug)}`,
      })),
      hotels: hotels.data.map((h) => ({
        ...h,
        to: '/stays',
      })),
      restaurants: restaurants.data.map((r) => ({
        ...r,
        to: r.slug ? `/places/${encodeURIComponent(r.slug)}` : '/food',
      })),
      activities: activities.data.map((a) => ({
        ...a,
        to: '/acts',
      })),
      guides: guides.data.map((g) => ({
        ...g,
        to: '/guides',
      })),
    };
  }

  private vendorSubtitle(notes: string | null, fallback: string): string {
    if (!notes?.trim()) return fallback;
    const parts = notes
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    const rate = parts.find((p) => /^rate\b/i.test(p) || /^price\b/i.test(p));
    if (rate) {
      return rate.replace(/^(Rate|Price)\s*/i, 'From ').slice(0, 140);
    }
    const addr = parts.find((p) => /^address\b/i.test(p));
    if (addr) {
      const cleaned = addr.replace(/^Address:\s*/i, '').trim();
      if (cleaned && !/^https?:\/\//i.test(cleaned)) {
        return cleaned.slice(0, 140);
      }
    }
    const nonUrl = parts.find((p) => !/^https?:\/\//i.test(p) && !/@/.test(p));
    if (nonUrl) return nonUrl.slice(0, 140);
    return fallback;
  }

  private isPublicVendorName(name: string | null | undefined): boolean {
    if (!name?.trim()) return false;
    const n = name.trim().toLowerCase();
    if (/^user\d*$/.test(n)) return false;
    if (n.startsWith('uservendor')) return false;
    if (n === 'driver' || n === 'test') return false;
    return true;
  }

  /** Prototype vehicle classes (aLo HTML transport catalog). */
  private carClasses() {
    return [
      {
        id: 'economy',
        title: 'Economy sedan',
        models: 'Hyundai Solaris · Kia Rio',
        pax: 3,
        hr: 1500,
      },
      {
        id: 'comfort',
        title: 'Comfort sedan',
        models: 'Toyota Camry · Skoda Octavia',
        pax: 3,
        hr: 1900,
      },
      {
        id: 'business',
        title: 'Business class',
        models: 'Mercedes E-Class · BMW 5',
        pax: 3,
        hr: 2900,
      },
      {
        id: 'suv',
        title: 'SUV',
        models: 'Toyota Land Cruiser · Mercedes GLE',
        pax: 4,
        hr: 3800,
      },
      {
        id: 'premium',
        title: 'Premium',
        models: 'Mercedes S-Class · BMW 7',
        pax: 3,
        hr: 5500,
      },
      {
        id: 'minivan',
        title: 'Minivan comfort',
        models: 'Mercedes V-Class · Toyota Alphard',
        pax: 6,
        hr: 4200,
      },
    ];
  }

  private mapVendorAround(
    v: {
      id: string;
      name: string;
      type: string;
      city: string | null;
      phone: string | null;
      notes: string | null;
    },
    _originLat: number,
    _originLng: number,
    section: string,
    badge: string,
  ) {
    const city = v.city?.trim() || 'Russia';
    const isMoscow = /moscow|москв/i.test(city);
    return {
      id: v.id,
      slug: v.id,
      title: v.name,
      description:
        this.vendorSubtitle(v.notes, '') ||
        `${v.name} — ${badge.toLowerCase()} in ${city}`,
      arabicDescription: null as string | null,
      area: city,
      category: badge,
      section,
      imageUrl: '',
      lat: RED_SQUARE.lat,
      lng: RED_SQUARE.lng,
      openLabel: v.phone ? `Call ${v.phone}` : 'Book via ZEEN',
      priceLabel: 'Ask ZEEN desk',
      badge,
      isFree: false,
      distanceMeters: isMoscow ? 2000 : 50_000,
      distanceLabel: city,
      walkLabel: isMoscow ? 'In Moscow' : city,
      kind: 'vendor' as const,
      phone: v.phone,
    };
  }

  private mapHomeCard(p: {

    slug: string;
    title: string;
    subtitle: string | null;
    imageUrl: string | null;
    badge: string | null;
  }) {
    return {
      id: p.slug,
      title: p.title,
      subtitle: p.subtitle ?? '',
      imageUrl: p.imageUrl ?? '',
      badge: p.badge,
    };
  }

  private mapAroundPlace(
    p: {
      slug: string;
      title: string;
      description: string;
      arabicDescription: string | null;
      area: string | null;
      category: string;
      aroundSection: string | null;
      imageUrl: string | null;
      lat: number;
      lng: number;
      openLabel: string | null;
      priceLabel: string | null;
      badge: string | null;
      isFree: boolean;
    },
    originLat: number,
    originLng: number,
  ) {
    const meters = this.haversineMeters(originLat, originLng, p.lat, p.lng);
    const walkMin = Math.max(1, Math.round(meters / 80));
    return {
      id: p.slug,
      title: p.title,
      description: p.description,
      arabicDescription: p.arabicDescription,
      area: p.area ?? '',
      category: p.category,
      section: p.aroundSection ?? 'shortRide',
      imageUrl: p.imageUrl ?? '',
      lat: p.lat,
      lng: p.lng,
      openLabel: p.openLabel ?? 'Open all day',
      priceLabel: p.priceLabel ?? (p.isFree ? 'Free entry' : 'Ticketed entry'),
      badge: p.badge ?? (p.isFree ? 'Free' : 'Ticket'),
      isFree: p.isFree,
      distanceMeters: Math.round(meters),
      distanceLabel: this.distanceLabel(meters),
      walkLabel: `${walkMin} min walk`,
    };
  }

  private mapDestinationDetail(d: {
    slug: string;
    title: string;
    tags: string[];
    imageUrl: string | null;
    nearMe: boolean;
    today: boolean;
    daylight: boolean;
  }) {
    const tags = d.tags?.length ? d.tags.join(' · ') : 'Moscow';
    return {
      id: d.slug,
      title: d.title,
      description: `${d.title} — explore option in Moscow (${tags}).`,
      arabicDescription: null,
      area: tags,
      category: d.tags?.[0] ?? 'Explore',
      section: 'explore',
      imageUrl: d.imageUrl ?? '',
      lat: RED_SQUARE.lat,
      lng: RED_SQUARE.lng,
      openLabel: d.today ? 'Good for today' : 'Check opening times',
      priceLabel: 'See options',
      badge: d.tags?.[0] ?? 'Explore',
      isFree: false,
      distanceMeters: 0,
      distanceLabel: d.nearMe ? 'Near you' : 'Moscow',
      walkLabel: d.daylight ? 'Best in daylight' : 'Any time',
      kind: 'destination' as const,
    };
  }

  private mapVendorDetail(v: {
    id: string;
    name: string;
    type: string;
    city: string | null;
    phone: string | null;
    notes: string | null;
  }) {
    const category =
      v.type === 'hotel'
        ? 'Stay'
        : v.type === 'restaurant'
          ? 'Food'
          : v.type === 'activity'
            ? 'Activity'
            : v.type === 'guide'
              ? 'Guide'
              : v.type === 'transport' || v.type === 'driver' || v.type === 'bus'
                ? 'Move'
                : 'Place';
    return {
      id: v.id,
      title: v.name,
      description:
        this.vendorSubtitle(v.notes, '') ||
        `${v.name} — ${category.toLowerCase()} partner in ${v.city ?? 'Moscow'}.`,
      arabicDescription: null,
      area: v.city ?? 'Moscow',
      category,
      section: 'catalog',
      imageUrl: '',
      lat: RED_SQUARE.lat,
      lng: RED_SQUARE.lng,
      openLabel: v.phone ? `Call ${v.phone}` : 'Book via ZEEN',
      priceLabel: 'Ask ZEEN desk',
      badge: category,
      isFree: false,
      distanceMeters: 0,
      distanceLabel: v.city ?? 'Moscow',
      walkLabel: 'See on map',
      kind: 'vendor' as const,
      phone: v.phone,
    };
  }

  private matchesExploreFilter(
    d: {
      tags: string[];
      nearMe: boolean;
      today: boolean;
      daylight: boolean;
    },
    filterId: string | null,
  ): boolean {
    if (!filterId) return true;
    switch (filterId) {
      case 'near_me':
        return d.nearMe;
      case 'today':
        return d.today;
      case 'daylight':
        return d.daylight || d.tags.includes('Outside');
      case 'family':
        return d.tags.includes('Family');
      default:
        return d.tags.some((t) => t.toLowerCase() === filterId.toLowerCase());
    }
  }

  private categoryLabel(id: string): string {
    const map: Record<string, string> = {
      food: 'Food',
      coffee: 'Coffee',
      shopping: 'Shopping',
      places: 'Places',
      kids: 'Kids',
      mosque: 'Mosque',
      pharmacy: 'Pharmacy',
      supermarket: 'Supermarket',
      exchange: 'Exchange',
      metro: 'Metro',
    };
    return map[id] ?? id;
  }

  private haversineMeters(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  private distanceLabel(meters: number): string {
    if (meters < 1) return '0 m away';
    if (meters < 1000) return `${Math.round(meters)} m away`;
    return `${(meters / 1000).toFixed(1)} km away`;
  }
}
