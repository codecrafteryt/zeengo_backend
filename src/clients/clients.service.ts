import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import {
  pageMeta,
  parseSort,
  toSkipTake,
} from '../common/pagination/pagination';
import {
  CreateClientDto,
  ListClientsQuery,
  UpdateClientDto,
} from './clients.schema';
import { mapClient } from './clients.mapper';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClientDto) {
    const phoneTaken = await this.prisma.client.findFirst({
      where: { phone: dto.phone, deletedAt: null },
    });
    if (phoneTaken) {
      throw AppError.conflict('PHONE_TAKEN', 'Phone number already in use');
    }

    try {
      const row = await this.prisma.client.create({
        data: {
          fullName: dto.fullName,
          phone: dto.phone,
          email: dto.email,
          nationality: dto.nationality,
          whatsapp: dto.whatsapp,
          preferredLang: dto.preferredLang,
        },
        include: {
          bookings: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });
      return mapClient(row, row.bookings);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw AppError.conflict('PHONE_TAKEN', 'Phone number already in use');
      }
      throw err;
    }
  }

  async list(query: ListClientsQuery) {
    const { page, limit, skip, take } = toSkipTake(query);
    const where: Prisma.ClientWhereInput = { deletedAt: null };

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { fullName: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
      ];
    }

    const orderBy = parseSort(query.sort, ['fullName', 'createdAt', 'phone']);

    const [rows, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          bookings: {
            orderBy: { createdAt: 'desc' },
            take: 3,
          },
        },
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      data: rows.map((row) => mapClient(row, row.bookings)),
      meta: pageMeta(total, page, limit),
    };
  }

  async getById(id: string) {
    const row = await this.prisma.client.findFirst({
      where: { id, deletedAt: null },
      include: {
        bookings: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!row) {
      throw AppError.notFound('CLIENT_NOT_FOUND', 'Client not found');
    }

    return mapClient(row, row.bookings);
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.getById(id);

    if (dto.phone) {
      const phoneTaken = await this.prisma.client.findFirst({
        where: {
          phone: dto.phone,
          deletedAt: null,
          NOT: { id },
        },
      });
      if (phoneTaken) {
        throw AppError.conflict('PHONE_TAKEN', 'Phone number already in use');
      }
    }

    const row = await this.prisma.client.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        nationality: dto.nationality,
        whatsapp: dto.whatsapp,
        preferredLang: dto.preferredLang,
      },
      include: {
        bookings: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    return mapClient(row, row.bookings);
  }
}
