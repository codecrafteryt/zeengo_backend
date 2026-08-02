import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AppError } from '../common/errors/app-error';
import { mapSetting } from './settings.mapper';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listAll() {
    const settings = await this.prisma.setting.findMany({
      orderBy: { key: 'asc' },
    });
    return settings.map(mapSetting);
  }

  async getByKey(key: string) {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    if (!setting) {
      throw AppError.notFound('SETTING_NOT_FOUND', `Setting "${key}" not found`);
    }
    return mapSetting(setting);
  }

  async upsert(actorId: string, key: string, value: unknown) {
    const setting = await this.prisma.setting.upsert({
      where: { key },
      update: {
        value: value as object,
        updatedBy: actorId,
      },
      create: {
        key,
        value: value as object,
        updatedBy: actorId,
      },
    });

    await this.audit.log({
      actorType: 'staff',
      actorId,
      action: 'settings.update',
      entity: 'settings',
      entityId: null,
      diff: { key, value },
    });

    return mapSetting(setting);
  }
}
