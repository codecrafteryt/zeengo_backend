import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

/** Seeds aLo discovery content for /client/v2 (idempotent upsert by slug/key). */
export async function seedClientV2(prisma: PrismaClient): Promise<void> {
  const chip = async (
    kind: string,
    key: string,
    label: string,
    sortOrder: number,
    extra?: { subtitle?: string; iconKey?: string; meta?: object },
  ) => {
    await prisma.discoveryChip.upsert({
      where: { kind_key: { kind, key } },
      create: {
        id: randomUUID(),
        kind,
        key,
        label,
        subtitle: extra?.subtitle,
        iconKey: extra?.iconKey,
        meta: extra?.meta ?? {},
        sortOrder,
      },
      update: {
        label,
        subtitle: extra?.subtitle,
        iconKey: extra?.iconKey,
        meta: extra?.meta ?? {},
        sortOrder,
        isPublished: true,
      },
    });
  };

  const quick = [
    'Halal food near me',
    'Red Square',
    'Car with driver',
    'What can I do today?',
    'Train to St Petersburg',
  ];
  for (let i = 0; i < quick.length; i++) {
    await chip('homeQuick', `q${i}`, quick[i], i);
  }

  const cats: Array<[string, string]> = [
    ['stays', 'hotel_outlined'],
    ['car', 'directions_car_outlined'],
    ['places', 'place_outlined'],
    ['food', 'restaurant_outlined'],
    ['experience', 'confirmation_number_outlined'],
    ['tours', 'tour_outlined'],
    ['trains', 'train_outlined'],
  ];
  const catLabels = [
    'Stays',
    'Car & driver',
    'Places',
    'Food',
    'Experience',
    'Tours',
    'Trains',
  ];
  for (let i = 0; i < cats.length; i++) {
    await chip('homeCategory', cats[i][0], catLabels[i], i, {
      iconKey: cats[i][1],
    });
  }

  const suits: Array<[string, string, string, boolean?]> = [
    ['first_time', 'First time in Moscow', 'The essentials, in order', false],
    ['rainy', 'Rainy day', 'Indoor picks that still feel special', true],
    ['honeymoon', 'Honeymoon', 'Views, dinner and quiet evenings', false],
    ['family', 'With family', 'Parks, animals and easy pacing', false],
  ];
  const suitIcons = [
    'star_outline',
    'cloud_outlined',
    'favorite_outline',
    'groups_outlined',
  ];
  for (let i = 0; i < suits.length; i++) {
    await chip('suitMood', suits[i][0], suits[i][1], i, {
      subtitle: suits[i][2],
      iconKey: suitIcons[i],
      meta: { highlighted: !!suits[i][3] },
    });
  }

  const services: Array<[string, string, string, string]> = [
    ['things', 'Things to do', '118 experiences', 'auto_awesome_outlined'],
    ['hotels', 'Hotels', '149 hotels', 'hotel_outlined'],
    ['cars', 'Cars & drivers', '11 classes with driver', 'directions_car_outlined'],
    ['guide', 'Guide service', '12 Arabic guides', 'person_pin_circle_outlined'],
    ['money', 'Money now', 'Live ₽ rates & paying', 'payments_outlined'],
    ['live', 'Happening now', '50 live updates', 'notifications_none_outlined'],
  ];
  for (let i = 0; i < services.length; i++) {
    await chip('service', services[i][0], services[i][1], i, {
      subtitle: services[i][2],
      iconKey: services[i][3],
    });
  }

  const aroundCats: Array<[string, string, string]> = [
    ['food', 'Food', 'restaurant_outlined'],
    ['coffee', 'Coffee', 'local_cafe_outlined'],
    ['shopping', 'Shopping', 'shopping_bag_outlined'],
    ['places', 'Places', 'place_outlined'],
    ['kids', 'Kids', 'sentiment_satisfied_alt_outlined'],
    ['mosque', 'Mosque', 'mosque'],
    ['pharmacy', 'Pharmacy', 'local_pharmacy_outlined'],
    ['supermarket', 'Supermarket', 'storefront_outlined'],
    ['exchange', 'Exchange', 'currency_exchange_outlined'],
    ['metro', 'Metro', 'subway_outlined'],
  ];
  for (let i = 0; i < aroundCats.length; i++) {
    await chip('aroundCategory', aroundCats[i][0], aroundCats[i][1], i, {
      iconKey: aroundCats[i][2],
    });
  }

  const filters: Array<[string, string, string]> = [
    ['near_me', 'Near me', 'Nearby'],
    ['today', 'Today', 'Open today'],
    ['daylight', 'In daylight', 'Best in daylight'],
    ['family', 'Family', 'With kids'],
  ];
  for (let i = 0; i < filters.length; i++) {
    await chip('exploreFilter', filters[i][0], filters[i][1], i, {
      subtitle: filters[i][2],
    });
  }

  type PlaceSeed = {
    slug: string;
    title: string;
    description?: string;
    arabicDescription?: string;
    area?: string;
    category?: string;
    aroundSection?: string;
    homeRail?: string;
    imageUrl?: string;
    lat: number;
    lng: number;
    badge?: string;
    isFree?: boolean;
    priceLabel?: string;
    subtitle?: string;
    foodDescription?: string;
    foodLocation?: string;
    halalFriendly?: boolean;
    sortOrder: number;
  };

  const places: PlaceSeed[] = [
    // Around — under6
    {
      slug: 'red_square',
      title: 'Red Square',
      description: 'The heart of Moscow, where every visit starts.',
      arabicDescription: 'قلب موسكو، حيث تبدأ كل زيارة.',
      area: 'Okhotny Ryad',
      aroundSection: 'under6',
      imageUrl:
        'https://images.unsplash.com/photo-1513326738677-b964603b136d?w=400',
      lat: 55.7539,
      lng: 37.6208,
      isFree: true,
      sortOrder: 0,
    },
    {
      slug: 'gum',
      title: 'GUM',
      description: 'The most beautiful arcade on the square.',
      area: 'Ploshchad Revolyutsii',
      aroundSection: 'under6',
      imageUrl:
        'https://images.unsplash.com/photo-1547447134-cd3f5c716030?w=400',
      lat: 55.7546,
      lng: 37.6214,
      isFree: true,
      sortOrder: 1,
    },
    {
      slug: 'st_basil',
      title: "St Basil's Cathedral",
      description: 'The most photographed roofline in Russia.',
      area: 'Kitay-Gorod',
      aroundSection: 'under6',
      homeRail: 'moscowNow',
      subtitle: 'Culture · Red Square',
      badge: '-20%',
      imageUrl:
        'https://images.unsplash.com/photo-1520106212299-d99c43f456d6?w=400',
      lat: 55.7525,
      lng: 37.6231,
      isFree: false,
      priceLabel: 'Ticketed entry',
      sortOrder: 2,
    },
    {
      slug: 'kremlin',
      title: 'Moscow Kremlin',
      description: 'Fortress, cathedrals and the Armoury.',
      area: 'Aleksandrovsky Sad',
      aroundSection: 'under6',
      imageUrl:
        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400',
      lat: 55.752,
      lng: 37.6175,
      isFree: false,
      sortOrder: 3,
    },
    {
      slug: 'nikolskaya',
      title: 'Nikolskaya Street',
      description: 'The lit-up pedestrian street, cafes all day.',
      area: 'Lubyanka',
      aroundSection: 'under6',
      imageUrl:
        'https://images.unsplash.com/photo-1526481280695-3c4694932771?w=400',
      lat: 55.757,
      lng: 37.623,
      isFree: true,
      sortOrder: 4,
    },
    {
      slug: 'metro_ring',
      title: 'Metro ring stations',
      description: 'An underground museum on a normal commute.',
      area: 'Ring line',
      category: 'Metro',
      aroundSection: 'under6',
      imageUrl:
        'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=400',
      lat: 55.755,
      lng: 37.618,
      isFree: true,
      sortOrder: 5,
    },
    // shortWalk
    {
      slug: 'zaryadye',
      title: 'Zaryadye Park',
      description: 'Floating bridge and the best Kremlin views.',
      area: 'Kitay-Gorod',
      aroundSection: 'shortWalk',
      imageUrl:
        'https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?w=400',
      lat: 55.751,
      lng: 37.628,
      isFree: true,
      sortOrder: 10,
    },
    {
      slug: 'bolshoi',
      title: 'Bolshoi Theatre',
      description: 'World-famous ballet and opera house.',
      area: 'Teatralnaya',
      aroundSection: 'shortWalk',
      homeRail: 'closeToCentre',
      subtitle: 'Culture',
      imageUrl:
        'https://images.unsplash.com/photo-1503095396549-807759245b35?w=400',
      lat: 55.7594,
      lng: 37.6196,
      isFree: false,
      sortOrder: 11,
    },
    // shortRide + home rails
    {
      slug: 'childrens_store',
      title: 'Central Children’s Store',
      description: 'Toys and a rooftop view in the centre.',
      area: 'Lubyanka',
      aroundSection: 'shortRide',
      imageUrl:
        'https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?w=400',
      lat: 55.7595,
      lng: 37.626,
      isFree: true,
      sortOrder: 20,
    },
    {
      slug: 'tretyakov',
      title: 'Tretyakov Gallery',
      description: 'Classic Russian art.',
      area: 'Tretyakovskaya',
      aroundSection: 'shortRide',
      homeRail: 'moscowNow',
      subtitle: 'Culture · Inside Moscow',
      imageUrl:
        'https://images.unsplash.com/photo-1513326738677-b964603b136d?w=400',
      lat: 55.7415,
      lng: 37.6208,
      isFree: false,
      sortOrder: 21,
    },
    {
      slug: 'christ_cathedral',
      title: 'Cathedral of Christ the Saviour',
      description: 'The largest cathedral in Russia, free entry.',
      area: 'Kropotkinskaya',
      aroundSection: 'shortRide',
      imageUrl:
        'https://images.unsplash.com/photo-1520106212299-d99c43f456d6?w=400',
      lat: 55.7447,
      lng: 37.6055,
      isFree: true,
      sortOrder: 22,
    },
    {
      slug: 'pushkin',
      title: 'Pushkin Museum',
      description: 'World art next to the cathedral.',
      area: 'Kropotkinskaya',
      aroundSection: 'shortRide',
      imageUrl:
        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400',
      lat: 55.7473,
      lng: 37.6051,
      isFree: false,
      sortOrder: 23,
    },
    {
      slug: 'uzbekistan',
      title: 'Restaurant Uzbekistan',
      description: 'Uzbek kitchen, confirm halal when booking.',
      area: 'Tsvetnoy Bulvar',
      category: 'Food',
      aroundSection: 'shortRide',
      homeRail: 'food',
      foodDescription: 'Uzbek classic, open since the 1950s',
      foodLocation: 'Neglinnaya · Centre',
      halalFriendly: true,
      imageUrl:
        'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400',
      lat: 55.77,
      lng: 37.62,
      isFree: false,
      priceLabel: 'Reservation',
      sortOrder: 24,
    },
    {
      slug: 'chaihona',
      title: 'Chaihona No.1',
      description: 'Plov, lagman and many branches',
      category: 'Food',
      homeRail: 'food',
      foodDescription: 'Plov, lagman and many branches',
      foodLocation: 'Citywide',
      halalFriendly: true,
      imageUrl:
        'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400',
      lat: 55.76,
      lng: 37.62,
      isFree: false,
      sortOrder: 25,
    },
    {
      slug: 'krasny',
      title: 'Krasny Oktyabr',
      description: 'Old chocolate factory, now cafes and views.',
      area: 'Kropotkinskaya',
      aroundSection: 'shortRide',
      imageUrl:
        'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=400',
      lat: 55.74,
      lng: 37.61,
      isFree: true,
      sortOrder: 26,
    },
    {
      slug: 'arbat',
      title: 'Old Arbat',
      description: 'Pedestrian street with souvenirs and street art.',
      area: 'Arbatskaya',
      aroundSection: 'shortRide',
      imageUrl:
        'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=400',
      lat: 55.752,
      lng: 37.591,
      isFree: true,
      sortOrder: 27,
    },
    {
      slug: 'cable_car',
      title: 'Moscow Cable Car',
      homeRail: 'closeToCentre',
      subtitle: 'Views',
      description: 'Sparrow Hills ride',
      imageUrl:
        'https://images.unsplash.com/photo-1547447134-cd3f5c716030?w=400',
      lat: 55.71,
      lng: 37.55,
      isFree: false,
      sortOrder: 30,
    },
    {
      slug: 'sun_wheel',
      title: 'Sun of Moscow Wheel',
      homeRail: 'closeToCentre',
      subtitle: 'Views',
      description: 'Ferris wheel views',
      imageUrl:
        'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=400',
      lat: 55.83,
      lng: 37.63,
      isFree: false,
      sortOrder: 31,
    },
    {
      slug: 'river_cruise',
      title: 'River Cruise',
      homeRail: 'firstTime',
      subtitle: 'Tours',
      description: 'Moscow River sightseeing',
      imageUrl:
        'https://images.unsplash.com/photo-1526481280695-3c4694932771?w=400',
      lat: 55.75,
      lng: 37.62,
      isFree: false,
      sortOrder: 40,
    },
    {
      slug: 'heli_tour',
      title: 'Helicopter Tour',
      homeRail: 'firstTime',
      subtitle: 'Views · Outside',
      description: 'Aerial Moscow',
      imageUrl:
        'https://images.unsplash.com/photo-1474302770737-173ee21bab63?w=400',
      lat: 55.76,
      lng: 37.64,
      isFree: false,
      sortOrder: 41,
    },
    {
      slug: 'nikulin',
      title: 'Nikulin Circus',
      homeRail: 'withKids',
      subtitle: 'Family',
      description: 'Classic circus show',
      imageUrl:
        'https://images.unsplash.com/photo-1503095396549-807759245b35?w=400',
      lat: 55.7705,
      lng: 37.62,
      isFree: false,
      sortOrder: 50,
    },
    {
      slug: 'dream_island',
      title: 'Dream Island Park',
      homeRail: 'withKids',
      subtitle: 'Family',
      description: 'Theme park for families',
      imageUrl:
        'https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?w=400',
      lat: 55.69,
      lng: 37.67,
      isFree: false,
      sortOrder: 51,
    },
    {
      slug: 'dolphinarium',
      title: 'Dolphinarium',
      homeRail: 'withKids',
      subtitle: 'Family',
      description: 'Dolphin show',
      imageUrl:
        'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400',
      lat: 55.78,
      lng: 37.63,
      isFree: false,
      sortOrder: 52,
    },
  ];

  for (const p of places) {
    await prisma.discoveryPlace.upsert({
      where: { slug: p.slug },
      create: {
        id: randomUUID(),
        slug: p.slug,
        title: p.title,
        description: p.description ?? '',
        arabicDescription: p.arabicDescription,
        area: p.area,
        category: p.category ?? 'Sight',
        aroundSection: p.aroundSection,
        homeRail: p.homeRail,
        imageUrl: p.imageUrl,
        lat: p.lat,
        lng: p.lng,
        openLabel: 'Open all day',
        priceLabel: p.priceLabel ?? (p.isFree === false ? 'Ticketed entry' : 'Free entry'),
        badge: p.badge ?? (p.isFree === false ? 'Ticket' : 'Free'),
        isFree: p.isFree ?? true,
        subtitle: p.subtitle,
        foodDescription: p.foodDescription,
        foodLocation: p.foodLocation,
        halalFriendly: p.halalFriendly ?? false,
        sortOrder: p.sortOrder,
      },
      update: {
        title: p.title,
        description: p.description ?? '',
        arabicDescription: p.arabicDescription,
        area: p.area,
        category: p.category ?? 'Sight',
        aroundSection: p.aroundSection,
        homeRail: p.homeRail,
        imageUrl: p.imageUrl,
        lat: p.lat,
        lng: p.lng,
        priceLabel: p.priceLabel,
        badge: p.badge,
        isFree: p.isFree ?? true,
        subtitle: p.subtitle,
        foodDescription: p.foodDescription,
        foodLocation: p.foodLocation,
        halalFriendly: p.halalFriendly ?? false,
        sortOrder: p.sortOrder,
        isPublished: true,
      },
    });
  }

  const destinations: Array<{
    slug: string;
    title: string;
    tags: string[];
    imageUrl?: string;
    usePlaceholder?: boolean;
    nearMe?: boolean;
    today?: boolean;
    daylight?: boolean;
    sortOrder: number;
  }> = [
    { slug: 'nikulin', title: 'Nikulin Circus', tags: ['Family'], usePlaceholder: true, nearMe: true, today: true, sortOrder: 0 },
    { slug: 'dream_island', title: 'Dream Island Park', tags: ['Family', 'Outside'], imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600', today: true, daylight: true, sortOrder: 1 },
    { slug: 'dolphinarium', title: 'Moscow Dolphinarium', tags: ['Family'], imageUrl: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600', nearMe: true, today: true, sortOrder: 2 },
    { slug: 'bear_park', title: 'Bear Sanctuary', tags: ['Family', 'Outside'], imageUrl: 'https://images.unsplash.com/photo-1525382455947-f319bc05fb35?w=600', daylight: true, today: true, sortOrder: 3 },
    { slug: 'tiger_park', title: 'Tiger Park', tags: ['Family', 'Outside'], imageUrl: 'https://images.unsplash.com/photo-1561731216-c3c7aac53d54?w=600', daylight: true, today: true, sortOrder: 4 },
    { slug: 'husky_park', title: 'Husky Park', tags: ['Family', 'Outside'], imageUrl: 'https://images.unsplash.com/photo-1547407139-3c921a66005c?w=600', daylight: true, sortOrder: 5 },
    { slug: 'zaryadye_flight', title: 'Zaryadye Flight', tags: ['Family'], imageUrl: 'https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?w=600', nearMe: true, today: true, daylight: true, sortOrder: 6 },
    { slug: 'zaryadye_ice', title: 'Zaryadye Ice Cave', tags: ['Family'], imageUrl: 'https://images.unsplash.com/photo-1483664852095-d6cc68707026?w=600', nearMe: true, today: true, sortOrder: 7 },
    { slug: 'cosmonautics', title: 'Cosmonautics Museum', tags: ['Family'], usePlaceholder: true, today: true, daylight: true, sortOrder: 8 },
    { slug: 'planetarium', title: 'Moscow Planetarium', tags: ['Family'], imageUrl: 'https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?w=600', today: true, nearMe: true, sortOrder: 9 },
    { slug: 'zoo', title: 'Moscow Zoo', tags: ['Family', 'Outside'], imageUrl: 'https://images.unsplash.com/photo-1564349683136-77e08dba1ef7?w=600', nearMe: true, today: true, daylight: true, sortOrder: 10 },
    { slug: 'moskvarium', title: 'Moskvarium', tags: ['Family'], imageUrl: 'https://images.unsplash.com/photo-1544551763-77ef2d0cfc6c?w=600', today: true, daylight: true, sortOrder: 11 },
    { slug: 'nikulin_tsvetnoy', title: 'Nikulin Circus Tsvetnoy', tags: ['Family'], usePlaceholder: true, nearMe: true, today: true, sortOrder: 12 },
    { slug: 'puppet', title: 'Puppet Theatre', tags: ['Family'], imageUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600', nearMe: true, sortOrder: 13 },
    { slug: 'durov', title: 'Durov Animal Theatre', tags: ['Family'], imageUrl: 'https://images.unsplash.com/photo-1503095396549-807759245b35?w=600', today: true, nearMe: true, sortOrder: 14 },
    { slug: 'cosmos_pavilion', title: 'Cosmos Pavilion', tags: ['Family'], usePlaceholder: true, daylight: true, today: true, sortOrder: 15 },
    { slug: 'robostation', title: 'Robostation', tags: ['Family'], imageUrl: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600', today: true, sortOrder: 16 },
    { slug: 'smile_park', title: 'Smile Park', tags: ['Family', 'Outside'], imageUrl: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600', daylight: true, today: true, sortOrder: 17 },
    { slug: 'escape_quest', title: 'Escape Quest', tags: ['Family'], imageUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600', today: true, nearMe: true, sortOrder: 18 },
    { slug: 'crocus', title: 'Crocus Oceanarium', tags: ['Family', 'Outside'], imageUrl: 'https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=600', daylight: true, today: true, sortOrder: 19 },
    { slug: 'paleontology', title: 'Paleontology Museum', tags: ['Family'], imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600', today: true, daylight: true, sortOrder: 20 },
    { slug: 'ice_show', title: 'Ice Show', tags: ['Family'], imageUrl: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=600', today: true, sortOrder: 21 },
    { slug: 'anvio_vr', title: 'Anvio VR', tags: ['Family'], imageUrl: 'https://images.unsplash.com/photo-1622979135225-d2ba269cf1ac?w=600', today: true, nearMe: true, sortOrder: 22 },
    { slug: 'patriot', title: 'Patriot Park', tags: ['Family', 'Outside'], imageUrl: 'https://images.unsplash.com/photo-1513326738677-b964603b136d?w=600', daylight: true, today: true, sortOrder: 23 },
  ];

  for (const d of destinations) {
    await prisma.discoveryDestination.upsert({
      where: { slug: d.slug },
      create: {
        id: randomUUID(),
        slug: d.slug,
        title: d.title,
        tags: d.tags,
        imageUrl: d.imageUrl,
        usePlaceholder: d.usePlaceholder ?? false,
        nearMe: d.nearMe ?? false,
        today: d.today ?? false,
        daylight: d.daylight ?? false,
        sortOrder: d.sortOrder,
      },
      update: {
        title: d.title,
        tags: d.tags,
        imageUrl: d.imageUrl,
        usePlaceholder: d.usePlaceholder ?? false,
        nearMe: d.nearMe ?? false,
        today: d.today ?? false,
        daylight: d.daylight ?? false,
        sortOrder: d.sortOrder,
        isPublished: true,
      },
    });
  }

  const tripDays = [
    {
      dayNumber: 1,
      title: 'The heart of Moscow',
      mosqueKm: 1.0,
      stops: [
        { title: 'Nikulin Circus', subtitle: 'Tsvetnoy Boulevard', lat: 55.7705, lng: 37.62 },
        { title: 'GUM Ice Rink', subtitle: 'Red Square', lat: 55.7546, lng: 37.6214 },
        { title: 'Central Children’s Store', subtitle: 'Lubyanka', lat: 55.7595, lng: 37.626 },
        { title: 'Red Square', subtitle: 'Okhotny Ryad', lat: 55.7539, lng: 37.6208 },
      ],
    },
    {
      dayNumber: 2,
      title: 'VDNKh with the family',
      mosqueKm: 3.1,
      stops: [
        { title: 'Moskvarium', subtitle: 'VDNKh', lat: 55.832, lng: 37.629 },
        { title: 'Sun of Moscow wheel', subtitle: 'VDNKh', lat: 55.83, lng: 37.631 },
        { title: 'VDNKh park', subtitle: 'VDNKh', lat: 55.826, lng: 37.637 },
        { title: 'Uryuk', subtitle: 'Uzbek kitchen', lat: 55.828, lng: 37.635 },
      ],
    },
    {
      dayNumber: 3,
      title: 'Moscow City and Victory Park',
      mosqueKm: 3.7,
      stops: [
        { title: 'Panorama360', subtitle: 'Federation Tower', lat: 55.7494, lng: 37.537 },
        { title: 'Afimall City', subtitle: 'Moscow City', lat: 55.749, lng: 37.539 },
        { title: 'Victory Park', subtitle: 'Poklonnaya Hill', lat: 55.731, lng: 37.505 },
        { title: 'Dagestanskaya Lavka', subtitle: 'Dagestani food', lat: 55.74, lng: 37.52 },
      ],
    },
  ];

  for (const day of tripDays) {
    const existing = await prisma.discoveryTripDay.findUnique({
      where: { dayNumber: day.dayNumber },
    });
    const dayId = existing?.id ?? randomUUID();
    if (existing) {
      await prisma.discoveryTripStop.deleteMany({ where: { dayId } });
      await prisma.discoveryTripDay.update({
        where: { id: dayId },
        data: {
          title: day.title,
          mosqueKm: day.mosqueKm,
          sortOrder: day.dayNumber,
        },
      });
    } else {
      await prisma.discoveryTripDay.create({
        data: {
          id: dayId,
          dayNumber: day.dayNumber,
          title: day.title,
          mosqueKm: day.mosqueKm,
          sortOrder: day.dayNumber,
        },
      });
    }
    for (let i = 0; i < day.stops.length; i++) {
      const s = day.stops[i];
      await prisma.discoveryTripStop.create({
        data: {
          id: randomUUID(),
          dayId,
          title: s.title,
          subtitle: s.subtitle,
          lat: s.lat,
          lng: s.lng,
          sortOrder: i,
        },
      });
    }
  }

  console.log(
    `Client v2 discovery seeded: ${places.length} places, ${destinations.length} destinations, ${tripDays.length} trip days`,
  );
}
