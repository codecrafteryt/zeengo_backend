import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { slugify } from '../common/crypto.util';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { CreatePackageDto, UpdatePackageDto } from './packages.schema';
import { mapPackage } from './packages.mapper';

@Injectable()
export class PackagesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthPrincipal) {
    const where: Prisma.PackageWhereInput = { deletedAt: null };

    if (user.type === 'client') {
      where.isActive = true;
    }

    const rows = await this.prisma.package.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return rows.map(mapPackage);
  }

  async create(dto: CreatePackageDto) {
    const slug = dto.slug ?? slugify(dto.name);
    await this.assertSlugAvailable(slug);

    const row = await this.prisma.package.create({
      data: {
        name: dto.name,
        slug,
        pricePerPerson: dto.pricePerPerson,
        minPersons: dto.minPersons,
        durationDays: dto.durationDays,
        description: dto.description,
        inclusions: dto.inclusions,
      },
    });

    return mapPackage(row);
  }

  async update(id: string, dto: UpdatePackageDto) {
    const existing = await this.findOrThrow(id);

    if (dto.slug && dto.slug !== existing.slug) {
      await this.assertSlugAvailable(dto.slug, id);
    }

    const row = await this.prisma.package.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug,
        pricePerPerson: dto.pricePerPerson,
        minPersons: dto.minPersons,
        durationDays: dto.durationDays,
        description: dto.description,
        inclusions: dto.inclusions,
      },
    });

    return mapPackage(row);
  }

  async softDelete(id: string) {
    await this.findOrThrow(id);

    const row = await this.prisma.package.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return mapPackage(row);
  }

  private async findOrThrow(id: string) {
    const row = await this.prisma.package.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) {
      throw AppError.notFound('PACKAGE_NOT_FOUND', 'Package not found');
    }
    return row;
  }

  private async assertSlugAvailable(slug: string, excludeId?: string) {
    const existing = await this.prisma.package.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (existing) {
      throw AppError.conflict('SLUG_TAKEN', 'Package slug already exists');
    }
  }
}
