import { Controller, Get } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';

@Controller('test-metrics')
export class MetricsController {
  constructor(
    @InjectMetric('nestjs_http_request_total')
    private readonly requestCounter: Counter<string>,
    @InjectMetric('nestjs_http_request_duration_seconds')
    private readonly requestDuration: Histogram<string>,
  ) {}

  @Get()
  getMetrics() {
    // 增加测试数据
    this.requestCounter.inc({ method: 'GET', path: '/test-metrics', status: '200' });
    this.requestDuration.observe({ method: 'GET', path: '/test-metrics' }, Math.random());

    return {
      message: 'Test metrics recorded successfully',
    };
  }
}
