import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from '../../../common/observability/metrics.service';
import { Public } from '../../decorators/public.decorator';

@Public()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  getMetrics(): string {
    return this.metrics.getMetricsText();
  }
}
