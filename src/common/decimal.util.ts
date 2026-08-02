import { Decimal } from '@prisma/client/runtime/library';

export function decimalToNumber(
  value: Decimal | number | string | null | undefined,
): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return Number(value.toString());
}
