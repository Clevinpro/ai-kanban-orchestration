import { Controller, Get } from '@nestjs/common';
import { LoggerService } from '@ai-platform/shared';

@Controller()
export class HealthController {
  constructor(private readonly logger: LoggerService) {}

  @Get('health')
  getHealth(): void {
    this.logger.log('Health check requested', HealthController.name);
    // TODO: Return api-gateway health status.
  }
}
