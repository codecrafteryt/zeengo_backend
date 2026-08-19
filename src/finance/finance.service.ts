import { Injectable } from '@nestjs/common';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decimalToNumber } from '../common/decimal.util';
import type { RevenueByMethodQuery } from './finance.schema';

function localDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const PENDING_STATUSES: PaymentStatus[] = [
  PaymentStatus.pending,
  PaymentStatus.sent,
  PaymentStatus.opened,
];

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const paidTodayWhere = {
      status: PaymentStatus.paid,
      paidAt: { gte: startOfToday },
    };

    const [todayAgg, stripeAgg, cashAgg, pendingAgg, pendingCount] = await Promise.all([
      this.prisma.payment.aggregate({
        where: paidTodayWhere,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { ...paidTodayWhere, method: PaymentMethod.stripe },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { ...paidTodayWhere, method: PaymentMethod.cash },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { status: { in: PENDING_STATUSES } },
        _sum: { amount: true },
      }),
      this.prisma.payment.count({
        where: { status: { in: PENDING_STATUSES } },
      }),
    ]);

    return {
      today: {
        total: {
          amount: decimalToNumber(todayAgg._sum.amount),
          count: todayAgg._count,
        },
        stripe: {
          amount: decimalToNumber(stripeAgg._sum.amount),
          count: stripeAgg._count,
        },
        cash: {
          amount: decimalToNumber(cashAgg._sum.amount),
          count: cashAgg._count,
        },
      },
      pending: {
        amount: decimalToNumber(pendingAgg._sum.amount),
        count: pendingCount,
      },
    };
  }

  async revenueSeries(query: RevenueByMethodQuery) {
    const since = new Date();
    since.setDate(since.getDate() - (query.days - 1));
    since.setHours(0, 0, 0, 0);

    const rows = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.paid,
        paidAt: { gte: since },
      },
      select: {
        amount: true,
        method: true,
        paidAt: true,
      },
    });

    const points: Array<{
      date: string;
      stripe: number;
      cash: number;
      total: number;
    }> = [];

    for (let i = 0; i < query.days; i++) {
      const day = new Date(since);
      day.setDate(since.getDate() + i);
      const key = localDateKey(day);
      points.push({ date: key, stripe: 0, cash: 0, total: 0 });
    }

    const byDate = new Map(points.map((p) => [p.date, p]));

    for (const row of rows) {
      if (!row.paidAt) continue;
      const key = localDateKey(row.paidAt);
      const bucket = byDate.get(key);
      if (!bucket) continue;
      const amount = decimalToNumber(row.amount);
      if (row.method === PaymentMethod.stripe) bucket.stripe += amount;
      else bucket.cash += amount;
      bucket.total += amount;
    }

    return { days: query.days, points };
  }

  async revenueByMethod(query: RevenueByMethodQuery) {
    const since = new Date();
    since.setDate(since.getDate() - query.days);
    since.setHours(0, 0, 0, 0);

    const rows = await this.prisma.payment.groupBy({
      by: ['method'],
      where: {
        status: PaymentStatus.paid,
        paidAt: { gte: since },
      },
      _sum: { amount: true },
      _count: true,
    });

    const total = rows.reduce(
      (sum, row) => sum + decimalToNumber(row._sum.amount),
      0,
    );

    return {
      days: query.days,
      total,
      byMethod: rows.map((row) => ({
        method: row.method,
        amount: decimalToNumber(row._sum.amount),
        count: row._count,
      })),
    };
  }
}
