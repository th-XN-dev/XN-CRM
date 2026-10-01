import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { ApiEnvelopeResponse, ApiErrorResponse } from '../common/swagger/api-responses';
import { HealthService } from './health.service';

class HealthChecksDto {
  api!: 'up';
  database!: 'up' | 'down';
  redis!: 'up' | 'down' | 'disabled';
}

class HealthReportDto {
  status!: 'healthy' | 'degraded' | 'unhealthy';
  checks!: HealthChecksDto;
  uptimeSeconds!: number;
}

/** Served at `/health` (outside `/api/v1`) for load balancers and container healthchecks. */
@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'API, database and Redis status: healthy / degraded / unhealthy' })
  @ApiEnvelopeResponse(HealthReportDto)
  @ApiErrorResponse(HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE (database down)')
  async check() {
    const report = await this.health.check();
    if (report.status === 'unhealthy') {
      throw new AppException(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Service unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
        report,
      );
    }
    return report;
  }
}
