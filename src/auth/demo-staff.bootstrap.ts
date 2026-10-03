import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DEMO_STAFF_PASSWORD, ensureDemoStaff } from './ensure-demo-staff';
import {
  shouldBootstrapDemoStaff,
  shouldResetDemoPasswords,
} from './demo-staff.policy';

@Injectable()
export class DemoStaffBootstrap implements OnModuleInit {
  private readonly logger = new Logger(DemoStaffBootstrap.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    if (
      !shouldBootstrapDemoStaff(
        nodeEnv,
        this.config.get<string>('ALLOW_DEMO_STAFF'),
      )
    ) {
      this.logger.log('Demo staff bootstrap skipped (production)');
      return;
    }

    const password =
      this.config.get<string>('SEED_STAFF_PASSWORD')?.trim() ||
      this.config.get<string>('SEED_ADMIN_PASSWORD')?.trim() ||
      DEMO_STAFF_PASSWORD;

    await ensureDemoStaff(this.prisma, password, {
      resetPasswords: shouldResetDemoPasswords(nodeEnv),
    });
    this.logger.log('Demo staff accounts are ready (admin, ops, splizer, support, driver)');
  }
}
