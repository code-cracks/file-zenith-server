import { ApiProperty } from '@nestjs/swagger';

import { getCurrentTimestamp } from '@/utils';

export class ResponseDto<T> {
  @ApiProperty({ example: 200, description: 'HTTP status code' })
  code?: number;

  @ApiProperty({
    example: 'Created',
    description: 'Message describing the result of the operation',
  })
  message?: string;

  @ApiProperty({ description: 'The data returned by the API', nullable: true })
  data?: T;

  @ApiProperty({
    example: getCurrentTimestamp(),
    description: 'Current timestamp',
  })
  timestamp?: number;
}

export class RequestDetailsDto {
  @ApiProperty({
    description: 'Query parameters',
    type: 'object',
    additionalProperties: true,
  })
  query: Record<string, any>;

  @ApiProperty({
    description: 'Request body',
    type: 'object',
    additionalProperties: true,
  })
  body: Record<string, any>;

  @ApiProperty({
    description: 'Route parameters',
    type: 'object',
    additionalProperties: true,
  })
  params: Record<string, any>;

  @ApiProperty({
    description: 'Request headers',
    type: 'object',
    additionalProperties: true,
    example: {
      'user-agent': 'Mozilla/5.0',
      'accept-language': 'en-US',
      'content-type': 'application/json',
    },
  })
  headers: Record<string, any>;

  @ApiProperty({
    example: 'POST',
    description: 'HTTP method',
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  })
  method: string;

  @ApiProperty({
    example: '/api/v1/auth/login/email',
    description: 'Request URL',
  })
  url: string;

  @ApiProperty({
    example: getCurrentTimestamp(),
    description: 'Request timestamp',
    type: 'number',
  })
  timestamp: number;

  @ApiProperty({
    example: '::1',
    description: 'Client IP address',
    format: 'ipv4',
  })
  ip: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: 401, description: 'HTTP status code' })
  code: number;

  @ApiProperty({
    example: '验证码无效。',
    description: 'Error message describing the result of the operation',
  })
  message: string;

  @ApiProperty({
    type: RequestDetailsDto,
    description: 'Details of the request that caused the error',
  })
  data: RequestDetailsDto;
}
