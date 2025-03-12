import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { Observable, TimeoutError, catchError, throwError, timeout } from 'rxjs';
import { LoggerService } from 'src/common/logs/logs.service';

import { TIMEOUT_INTERCEPTOR } from '@/utils';

interface TimeoutConfig {
  excludePaths: string[];
  timeout: number;
}

interface RequestDetails {
  url: string;
  method: string;
  headers: Record<string, any>;
  query: Record<string, any>;
  params: Record<string, any>;
  body?: Record<string, any>;
}

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly config: TimeoutConfig = {
    excludePaths: ['/metrics', '/health', '/favicon.ico', '/api-docs'],
    timeout: TIMEOUT_INTERCEPTOR,
  };

  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const requestDetails = this.getRequestDetails(request);

    if (this.shouldSkipTimeout(requestDetails.url)) {
      return next.handle();
    }

    return next.handle().pipe(
      timeout(this.config.timeout),
      catchError((error) => this.handleError(error, requestDetails)),
    );
  }

  private getRequestDetails(request: FastifyRequest): RequestDetails {
    return {
      url: request.url,
      method: request.method,
      headers: this.sanitizeHeaders(request.headers),
      query: request.query || {},
      params: request.params || {},
      body: this.sanitizeBody(request.body),
    };
  }

  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];

    return Object.entries(headers).reduce((acc, [key, value]) => {
      acc[key] = sensitiveHeaders.includes(key.toLowerCase()) ? '[REDACTED]' : value;

      return acc;
    }, {});
  }

  private sanitizeBody(body: any): Record<string, any> | undefined {
    if (!body) return undefined;

    // 深拷贝以避免修改原始数据
    const sanitizedBody = JSON.parse(JSON.stringify(body));

    // 敏感字段处理
    const sensitiveFields = ['password', 'token', 'secret'];
    this.redactSensitiveData(sanitizedBody, sensitiveFields);

    return sanitizedBody;
  }

  private redactSensitiveData(obj: any, sensitiveFields: string[]): void {
    if (typeof obj !== 'object' || obj === null) return;

    Object.keys(obj).forEach((key) => {
      if (sensitiveFields.includes(key.toLowerCase())) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        this.redactSensitiveData(obj[key], sensitiveFields);
      }
    });
  }

  private shouldSkipTimeout(url: string): boolean {
    return this.config.excludePaths.some((path) => url.toLowerCase().includes(path.toLowerCase()));
  }

  private handleError(error: Error, requestDetails: RequestDetails) {
    if (error instanceof TimeoutError) {
      return this.handleTimeoutError(requestDetails);
    }

    return this.handleGenericError(error, requestDetails);
  }

  private handleTimeoutError(requestDetails: RequestDetails) {
    const timeoutMessage = this.createTimeoutMessage(requestDetails);

    this.logger.error({
      message: timeoutMessage,
      prefix: 'TIMEOUT',
      metadata: {
        ...requestDetails,
        timeout: this.config.timeout,
      },
    });

    return throwError(() => new RequestTimeoutException(timeoutMessage));
  }

  private handleGenericError(error: Error, requestDetails: RequestDetails) {
    this.logger.error({
      message: error.message,
      prefix: 'REQUEST_ERROR',
      metadata: {
        ...requestDetails,
        errorName: error.name,
        stack: error.stack,
      },
    });

    return throwError(() => error);
  }

  private createTimeoutMessage(requestDetails: RequestDetails): string {
    return `Request timeout after ${this.config.timeout}ms - ${requestDetails.method} ${requestDetails.url}`;
  }
}
