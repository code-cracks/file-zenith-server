import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import * as requestIp from '@supercharge/request-ip';
import { FastifyRequest, FastifyReply } from 'fastify';

import { LoggerService } from '../../common/logs/logs.service';

import { getCurrentTimestamp } from '@/utils';

// 定义接口
interface HttpExceptionResponse {
  statusCode: number;
  message: any;
  error: string;
}

interface RequestDetails {
  query: Record<string, any>;
  body: Record<string, any>;
  params: Record<string, any>;
  method: string;
  url: string;
  headers: Record<string, any>;
  ip: string;
  timestamp: number;
}

interface ErrorResponse {
  code: number;
  message: string | string[];
  data: RequestDetails;
}

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];

  constructor(
    private readonly logger: LoggerService,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    try {
      const { httpAdapter } = this.httpAdapterHost;
      const ctx = host.switchToHttp();
      const request = ctx.getRequest<FastifyRequest>();
      const response = ctx.getResponse<FastifyReply>();

      const requestDetails = this.getRequestDetails(request);
      const { statusCode, errorMessage } = this.getErrorDetails(exception);
      const responseBody = this.createResponseBody(statusCode, errorMessage, requestDetails);

      this.logError(exception, responseBody);
      httpAdapter.reply(response, responseBody, statusCode);
    } catch (error) {
      // 确保异常过滤器本身的错误也被处理
      Logger.error('Exception filter failed:', error);

      const response = host.switchToHttp().getResponse<FastifyReply>();
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        code: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        data: null,
      });
    }
  }

  private getRequestDetails(request: FastifyRequest): RequestDetails {
    return {
      query: request.query || {},
      body: this.sanitizeData(request.body),
      params: request.params || {},
      method: request.method,
      url: request.url,
      headers: this.sanitizeHeaders(request.headers),
      ip: requestIp.getClientIp(request) || 'unknown',
      timestamp: getCurrentTimestamp(),
    };
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

  private sanitizeData(data: any): Record<string, any> {
    if (!data || typeof data !== 'object') {
      return {};
    }

    const sensitiveFields = ['password', 'token', 'secret'];
    const sanitized = JSON.parse(JSON.stringify(data));

    const redactSensitiveFields = (obj: any) => {
      for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          redactSensitiveFields(obj[key]);
        } else if (sensitiveFields.includes(key.toLowerCase())) {
          obj[key] = '[REDACTED]';
        }
      }
    };

    redactSensitiveFields(sanitized);

    return sanitized;
  }

  private getErrorDetails(exception: unknown): {
    statusCode: number;
    errorMessage: string | string[];
  } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse() as HttpExceptionResponse;

      return {
        statusCode: exception.getStatus(),
        errorMessage: response.message || exception.message,
      };
    }

    // 处理非 HTTP 异常
    const errorMessage = exception instanceof Error ? exception.message : String(exception);

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      errorMessage,
    };
  }

  private createResponseBody(
    statusCode: number,
    message: string | string[],
    requestDetails: RequestDetails,
  ): ErrorResponse {
    return {
      code: statusCode,
      message,
      data: requestDetails,
    };
  }

  private logError(exception: unknown, responseBody: ErrorResponse): void {
    const errorStack = exception instanceof Error ? exception.stack?.split('\n') : [];

    this.logger.error({
      message: 'Request failed',
      prefix: 'EXCEPTION',
      metadata: {
        ...responseBody,
        stackTrace: errorStack,
        errorName: exception instanceof Error ? exception.name : 'Unknown Error',
      },
    });
  }
}
