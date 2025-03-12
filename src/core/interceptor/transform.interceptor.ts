import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { getReasonPhrase } from 'http-status-codes';

import { getCurrentTimestamp } from '@/utils';
import { ResponseDto } from '@/common/dto/response.dto';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ResponseDto<T>> {
  // 定义需要跳过转换的路径
  private readonly SKIP_URLS = ['/metrics', '/health', '/favicon.ico'];

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ResponseDto<T>> {
    const response = context.switchToHttp().getResponse<FastifyReply>();
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    return next.handle().pipe(
      map((data) => {
        // 如果需要跳过转换，直接返回原始数据
        if (this.shouldSkipTransform(request.url)) {
          return data;
        }

        return this.transformResponse(data, response);
      }),
    );
  }

  private shouldSkipTransform(url: string): boolean {
    return this.SKIP_URLS.some((skipUrl) => url.includes(skipUrl));
  }

  private transformResponse(data: any, response: FastifyReply): ResponseDto<T> {
    const statusCode = response.statusCode || 200;
    const defaultMessage = getReasonPhrase(statusCode);

    // 设置响应状态码
    response.status(statusCode);

    // 处理不同的响应数据结构
    const responseData = this.extractResponseData(data);
    const responseMessage = this.extractResponseMessage(data, defaultMessage);

    return {
      code: statusCode,
      message: responseMessage,
      data: responseData,
      timestamp: getCurrentTimestamp(),
    };
  }

  private extractResponseData(data: any): T | null {
    if (!data) {
      return null;
    }

    // 如果数据已经包含data字段，返回data字段的值
    if (data.data !== undefined) {
      return data.data;
    }

    // 否则返回整个数据对象
    return data;
  }

  private extractResponseMessage(data: any, defaultMessage: string): string {
    if (data?.message) {
      return data.message;
    }

    return defaultMessage;
  }
}
