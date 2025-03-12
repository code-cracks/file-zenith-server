import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Counter } from 'prom-client';
import { LoggerService } from 'src/common/logs/logs.service';

import { ErrorResponseDto, RequestDetailsDto } from '@/common/dto/response.dto';
import { getCurrentTimestamp } from '@/utils';

interface ErrorDetails {
  status: number;
  message: string;
  path: string;
  method: string;
  timestamp: number;
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly sensitiveFields = ['password', 'token', 'secret'];
  private readonly sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];

  constructor(
    @InjectMetric('http_exception_total')
    private readonly prometheusCounter: Counter<string>,
    private readonly logger: LoggerService,
  ) {}

  async catch(exception: HttpException, host: ArgumentsHost): Promise<void> {
    try {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<FastifyReply>();
      const request = ctx.getRequest<FastifyRequest>();

      const errorDetails = this.getErrorDetails(exception, request);
      const requestDetails = this.getRequestDetails(request);

      await this.handleException(errorDetails, requestDetails, response);
      this.incrementMetrics(errorDetails);
      this.logError(errorDetails, requestDetails, exception);
    } catch (error) {
      // 处理过滤器本身的错误
      this.logger.error({
        message: 'Exception filter failed',
        prefix: 'FILTER_ERROR',
        metadata: {
          originalError: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });

      // 确保至少返回一个错误响应
      const response = host.switchToHttp().getResponse<FastifyReply>();
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        code: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        data: null,
      });
    }
  }

  private getErrorDetails(exception: HttpException, request: FastifyRequest): ErrorDetails {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const message =
      typeof response === 'string' ? response : (response as any).message || exception.message;

    return {
      status,
      message,
      path: request.url,
      method: request.method,
      timestamp: getCurrentTimestamp(),
    };
  }

  private getRequestDetails(request: FastifyRequest): RequestDetailsDto {
    return {
      query: this.sanitizeData(request.query),
      body: this.sanitizeData(request.body),
      params: this.sanitizeData(request.params),
      method: request.method,
      url: request.url,
      timestamp: getCurrentTimestamp(),
      ip: request.ip,
      headers: this.sanitizeHeaders(request.headers),
    };
  }

  private sanitizeData(data: any): Record<string, any> {
    if (!data || typeof data !== 'object') {
      return {};
    }

    const sanitized = JSON.parse(JSON.stringify(data));
    this.redactSensitiveFields(sanitized);

    return sanitized;
  }

  private redactSensitiveFields(obj: any): void {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    for (const key in obj) {
      if (this.sensitiveFields.includes(key.toLowerCase())) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        this.redactSensitiveFields(obj[key]);
      }
    }
  }

  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sanitized = { ...headers };
    this.sensitiveHeaders.forEach((header) => {
      if (header in sanitized) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  private async handleException(
    errorDetails: ErrorDetails,
    requestDetails: RequestDetailsDto,
    response: FastifyReply,
  ): Promise<void> {
    const errorResponse: ErrorResponseDto = {
      code: errorDetails.status,
      message: errorDetails.message,
      data: requestDetails,
    };

    await response.status(errorDetails.status).send(errorResponse);
  }

  private incrementMetrics(errorDetails: ErrorDetails): void {
    this.prometheusCounter
      .labels(errorDetails.method, errorDetails.path, errorDetails.status.toString())
      .inc();
  }

  private logError(
    errorDetails: ErrorDetails,
    requestDetails: RequestDetailsDto,
    exception: HttpException,
  ): void {
    this.logger.error({
      message: errorDetails.message,
      prefix: 'HTTP_EXCEPTION',
      metadata: {
        ...errorDetails,
        requestDetails,
        stack: exception.stack,
        response: exception.getResponse(),
      },
    });
  }
}
