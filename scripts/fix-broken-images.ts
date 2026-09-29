import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const placeFixes: Record<string, string> = {
  st_basil:
    'https://images.unsplash.com/photo-1513326738677-b964603b136d?w=800&q=80',
  christ_cathedral:
    'https://images.unsplash.com/photo-1556610961-2fecc5927173?w=800&q=80',
  nikolskaya:
    'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80',
  river_cruise:
    'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80',
  tretyakov:
    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&q=80',
};

const destFixes: Record<string, string> = {
  tiger_park:
    'https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=800&q=80',
  zaryadye_ice:
    'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=800&q=80',
  nikulin:
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80',
  nikulin_tsvetnoy:
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80',
  cosmonautics:
    'https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?w=800&q=80',
  cosmos_pavilion:
    'https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?w=800&q=80',
};

async function main() {
  for (const [slug, imageUrl] of Object.entries(placeFixes)) {
    const r = await prisma.discoveryPlace.updateMany({
      where: { slug },
      data: { imageUrl },
    });
    console.log('place', slug, r.count);
  }
  for (const [slug, imageUrl] of Object.entries(destFixes)) {
    const r = await prisma.discoveryDestination.updateMany({
      where: { slug },
      data: { imageUrl, usePlaceholder: false },
    });
    console.log('dest', slug, r.count);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
