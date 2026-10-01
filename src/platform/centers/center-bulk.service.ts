import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { type AuthUser } from '../../common/types/request.types';
import { type BulkCentersDto } from '../dto/center.dto';
import { CenterPurgeService } from './center-purge.service';
import { OwnerCentersService } from './owner-centers.service';

/**
 * Archive or permanently delete several centers at once. Each center goes
 * through the same rules as a single action (archive only what isn't archived,
 * delete only archived ones) and is reported on its own: one failure doesn't
 * stop the rest.
 */
@Injectable()
export class CenterBulkService {
  constructor(
    private readonly centers: OwnerCentersService,
    private readonly purge: CenterPurgeService,
  ) {}

  async run(actor: AuthUser, dto: BulkCentersDto) {
    if (dto.action === 'delete' && dto.confirm?.trim() !== String(dto.ids.length)) {
      throw confirmationMismatch('Type the number of selected centers to confirm the deletion');
    }
    const results: { id: string; ok: boolean; code: string | null }[] = [];
    for (const id of dto.ids) {
      try {
        if (dto.action === 'archive') await this.centers.archive(actor, id);
        else await this.purge.purge(actor, id);
        results.push({ id, ok: true, code: null });
      } catch (error) {
        if (!(error instanceof AppException)) throw error;
        results.push({ id, ok: false, code: error.code });
      }
    }
    const succeeded = results.filter((r) => r.ok).length;
    return { succeeded, failed: results.length - succeeded, results };
  }
}

export const confirmationMismatch = (message: string): AppException =>
  AppException.badRequest(ErrorCode.CONFIRMATION_MISMATCH, message);
