import { Setting } from '@prisma/client';

export function mapSetting(setting: Setting) {
  return {
    key: setting.key,
    value: setting.value,
    updatedBy: setting.updatedBy,
    updatedAt: setting.updatedAt.toISOString(),
  };
}
