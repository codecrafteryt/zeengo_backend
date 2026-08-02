import { Injectable } from '@nestjs/common';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decimalToNumber } from '../common/decimal.util';
import { RevenueByMethodQuery } from './finance.schema';

const PENDING_STATUSES: PaymentStatus[] = [
  PaymentStatus.pending,
  PaymentStatus.sent,
  PaymentStatus.opened,
];

const CASH_METHODS: PaymentMethod[] = [
  PaymentMethod.cash,
  PaymentMethod.rajhi_transfer,
  PaymentMethod.usdt_trc20,
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

    const [stripeAgg, cashAgg, pendingAgg, pendingCount] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { ...paidTodayWhere, method: PaymentMethod.stripe },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { ...paidTodayWhere, method: { in: CASH_METHODS } },
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
