import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { type SystemRoleKey } from './roles.catalog';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async getSystemRoleId(key: SystemRoleKey): Promise<string> {
    const role = await this.prisma.role.findFirst({
      where: { key, organizationId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) {
      // Deployment error, not a client error: the seed has not been run.
      throw new Error(`System role "${key}" is missing. Run \`npm run db:seed\`.`);
    }
    return role.id;
  }
}
