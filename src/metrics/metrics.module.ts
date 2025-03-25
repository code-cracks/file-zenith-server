import { Module } from '@nestjs/common';
import {
  PrometheusModule,
  makeCounterProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';

import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
        config: {
          prefix: 'nestjs_',
        },
      },
      path: '/metrics',
    }),
  ],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    makeCounterProvider({
      name: 'nestjs_http_request_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'],
    }),
    makeHistogramProvider({
      name: 'nestjs_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path'],
      buckets: [0.1, 0.5, 1, 2, 5],
    }),
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
