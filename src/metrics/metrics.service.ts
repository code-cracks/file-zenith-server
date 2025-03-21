import { Injectable } from '@nestjs/common';
import { Counter, Histogram } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('nestjs_http_request_total')
    private readonly requestCounter: Counter<string>,
    @InjectMetric('nestjs_http_request_duration_seconds')
    private readonly requestDuration: Histogram<string>,
  ) {}

  // 记录请求次数
  async incrementRequestCount(method: string, path: string, status: number) {
    console.log('incrementRequestCount', method, path, status);
    await this.requestCounter.inc({ method, path, status: status.toString() });
  }

  // 记录请求持续时间
  async recordRequestDuration(method: string, path: string, duration: number) {
    await this.requestDuration.observe({ method, path }, duration);
  }
}
