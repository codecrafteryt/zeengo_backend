import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError } from '../common/errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import type { DestinationsQuery, NearbyPlacesQuery } from './client-v2.schema';

const RED_SQUARE = { lat: 55.7539, lng: 37.6208 };

@Injectable()
export class ClientV2Service {
  constructor(private readonly prisma: PrismaService) {}

  async homeFeed() {
    const [chips, places] = await Promise.all([
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

    return {
      quickChips: byKind('homeQuick').map((c) => c.label),
      categories: byKind('homeCategory'),
      suitYou: byKind('suitMood'),
      services: byKind('service'),
      exploreFilters: byKind('exploreFilter'),
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

    const where: Prisma.DiscoveryPlaceWhereInput = {
      isPublished: true,
    };
    if (query.section) where.aroundSection = query.section;
    if (query.homeRail) where.homeRail = query.homeRail;
    if (query.category) {
      where.OR = [
        { category: { equals: query.category, mode: 'insensitive' } },
        { category: { equals: this.categoryLabel(query.category), mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.discoveryPlace.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });

    const mapped = rows
      .map((p) => this.mapAroundPlace(p, originLat, originLng))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    const categories = await this.prisma.discoveryChip.findMany({
      where: { kind: 'aroundCategory', isPublished: true },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      origin: {
        lat: originLat,
        lng: originLng,
        label:
          query.lat != null && query.lng != null ? 'Your location' : 'Red Square',
      },
      categories: categories.map((c) => ({
        id: c.key,
        label: c.label,
        iconKey: c.iconKey,
      })),
      sections: {
        under6: mapped.filter((p) => p.section === 'under6'),
        shortWalk: mapped.filter((p) => p.section === 'shortWalk'),
        shortRide: mapped.filter((p) => p.section === 'shortRide'),
      },
      data: mapped,
    };
  }

  async getPlace(slugOrId: string) {
    const place = await this.prisma.discoveryPlace.findFirst({
      where: {
        isPublished: true,
        OR: [{ slug: slugOrId }, { id: slugOrId }],
      },
    });
    if (!place) throw AppError.notFound('PLACE_NOT_FOUND', 'Place not found');
    return this.mapAroundPlace(place, RED_SQUARE.lat, RED_SQUARE.lng);
  }

  async listDestinations(query: DestinationsQuery) {
    const filters = await this.prisma.discoveryChip.findMany({
      where: { kind: 'exploreFilter', isPublished: true },
      orderBy: { sortOrder: 'asc' },
    });

    const rows = await this.prisma.discoveryDestination.findMany({
      where: { isPublished: true },
      orderBy: { sortOrder: 'asc' },
    });

    const filterId = query.filter?.trim() || null;
    const data = rows
      .map((d) => ({
        id: d.slug,
        title: d.title,
        tags: d.tags,
        imageUrl: d.imageUrl,
        usePlaceholder: d.usePlaceholder,
        nearMe: d.nearMe,
        today: d.today,
        daylight: d.daylight,
      }))
      .filter((d) => this.matchesExploreFilter(d, filterId));

    const active = filters.find((f) => f.key === filterId);

    return {
      filters: filters.map((f) => ({
        id: f.key,
        label: f.label,
        statusTitle: f.subtitle,
      })),
      filter: filterId,
      statusTitle: active?.subtitle ?? active?.label ?? 'All',
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
