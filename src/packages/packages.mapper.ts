import { Package } from '@prisma/client';
import { decimalToNumber } from '../common/decimal.util';

export type PackageDto = {
  id: string;
  name: string;
  slug: string;
  pricePerPerson: number;
  minPersons: number;
  durationDays: number | null;
  description: string | null;
  inclusions: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function parseInclusions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

export function mapPackage(row: Package): PackageDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    pricePerPerson: decimalToNumber(row.pricePerPerson),
    minPersons: row.minPersons,
    durationDays: row.durationDays,
    description: row.description,
    inclusions: parseInclusions(row.inclusions),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
