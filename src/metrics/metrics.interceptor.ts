import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { FastifyRequest, FastifyReply } from 'fastify';

import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly excludePaths = ['/metrics'];

  constructor(private metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    const { method, url } = request;

    // Skip metrics collection for the metrics endpoint itself to avoid infinite loops
    if (this.excludePaths.some((path) => url.includes(path))) {
      return next.handle();
    }

    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = (Date.now() - start) / 1000;
          const status = response.statusCode;

          // 记录请求指标
          this.metricsService.incrementRequestCount(method, url, status);
          this.metricsService.recordRequestDuration(method, url, duration);

          console.log(
            `[Metrics] Method: ${method}, Path: ${url}, Status: ${status}, Duration: ${duration}s`,
          );
        },
        error: (error) => {
          const duration = (Date.now() - start) / 1000;
          const status = error.status || 500;

          // 记录错误请求指标
          this.metricsService.incrementRequestCount(method, url, status);
          this.metricsService.recordRequestDuration(method, url, duration);

          console.log(
            `[Metrics Error] Method: ${method}, Path: ${url}, Status: ${status}, Duration: ${duration}s`,
          );
        },
      }),
    );
  }
}
