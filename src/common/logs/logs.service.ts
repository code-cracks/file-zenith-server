import * as path from 'path';
import { Injectable } from '@nestjs/common';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

// 统一的日志参数接口
interface LogParams {
  message: string | Error | Record<string, any>;
  prefix?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class LoggerService {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.NODE_ENV !== 'production' ? 'silly' : 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.colorize(),
        winston.format.errors({ stack: true }),
        this.createCustomFormat(),
      ),
      transports: this.createTransports(),
    });
  }

  private createCustomFormat() {
    return winston.format.printf(({ timestamp, level, message, prefix, metadata, stack }) => {
      let logMessage = `[${timestamp}]-【${level}】`;

      // 添加前缀
      if (prefix) {
        logMessage += `-【${prefix}】`;
      }

      // 添加主要信息
      logMessage += ` ${message}`;

      // 添加元数据
      if (metadata && Object.keys(metadata).length > 0) {
        logMessage += `\nMetadata: ${JSON.stringify(metadata, null, 2)}`;
      }

      // 添加错误堆栈
      if (stack) {
        logMessage += `\nStack: ${stack}`;
      }

      return logMessage;
    });
  }

  private createTransports(): winston.transport[] {
    const transportsList: winston.transport[] = [
      new DailyRotateFile({
        filename: path.join(process.cwd(), 'logs', 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
        level: 'error',
        handleExceptions: true,
      }),
      new DailyRotateFile({
        filename: path.join(process.cwd(), 'logs', 'info-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        handleExceptions: true,
        maxSize: '20m',
        maxFiles: '14d',
        level: 'silly',
      }),
    ];

    if (process.env.NODE_ENV !== 'production') {
      transportsList.push(
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),
      );
    }

    return transportsList;
  }

  private formatMessage(message: string | Error | Record<string, any>): string {
    try {
      // 处理 Error 对象
      if (message instanceof Error) {
        return message.message;
      }

      // 处理字符串
      if (typeof message === 'string') {
        return message;
      }

      // 处理对象类型
      if (message && typeof message === 'object') {
        // 如果对象有 message 属性
        if ('message' in message) {
          const msgContent = message.message;

          if (typeof msgContent === 'string') {
            return msgContent;
          }

          if (msgContent instanceof Error) {
            return msgContent.message;
          }

          return JSON.stringify(msgContent);
        }

        // 其他对象
        return JSON.stringify(message, null, 2);
      }

      // 处理其他类型
      return String(message);
    } catch {
      return '[Unserializable object]';
    }
  }

  private normalizeLogParams(
    input: string | Error | Record<string, any> | LogParams,
    prefix?: string,
    metadata?: Record<string, any>,
  ): LogParams {
    // 如果输入已经是 LogParams 格式
    if (
      typeof input === 'object' &&
      !Array.isArray(input) &&
      input !== null &&
      'message' in input &&
      !('stack' in input) // 排除 Error 对象
    ) {
      return input as LogParams;
    }

    // 构造标准的 LogParams
    return {
      message: input,
      prefix,
      metadata,
    };
  }

  private logMessage(
    level: string,
    input: string | Error | Record<string, any> | LogParams,
    prefix?: string,
    metadata?: Record<string, any>,
  ): void {
    try {
      const params = this.normalizeLogParams(input, prefix, metadata);

      const logData = {
        level,
        message: this.formatMessage(params.message),
        prefix: params.prefix,
        metadata: {
          ...(params.metadata || {}),
          // 处理 Error 对象的特殊属性
          ...(params.message instanceof Error
            ? {
                errorName: params.message.name,
                stack: params.message.stack,
              }
            : {}),
          // 处理对象类型的原始数据
          ...(typeof params.message === 'object' && !(params.message instanceof Error)
            ? {
                originalData: params.message,
              }
            : {}),
        },
      };

      this.logger.log(logData);
    } catch (error) {
      console.error('Logging failed:', error);
    }
  }

  // 统一的公共日志方法
  public error(
    input: string | Error | Record<string, any> | LogParams,
    prefix?: string,
    metadata?: Record<string, any>,
  ): void {
    this.logMessage('error', input, prefix, metadata);
  }

  public warn(
    input: string | Error | Record<string, any> | LogParams,
    prefix?: string,
    metadata?: Record<string, any>,
  ): void {
    this.logMessage('warn', input, prefix, metadata);
  }

  public info(
    input: string | Error | Record<string, any> | LogParams,
    prefix?: string,
    metadata?: Record<string, any>,
  ): void {
    this.logMessage('info', input, prefix, metadata);
  }

  public http(
    input: string | Error | Record<string, any> | LogParams,
    prefix?: string,
    metadata?: Record<string, any>,
  ): void {
    this.logMessage('http', input, prefix, metadata);
  }

  public verbose(
    input: string | Error | Record<string, any> | LogParams,
    prefix?: string,
    metadata?: Record<string, any>,
  ): void {
    this.logMessage('verbose', input, prefix, metadata);
  }

  public debug(
    input: string | Error | Record<string, any> | LogParams,
    prefix?: string,
    metadata?: Record<string, any>,
  ): void {
    this.logMessage('debug', input, prefix, metadata);
  }

  public silly(
    input: string | Error | Record<string, any> | LogParams,
    prefix?: string,
    metadata?: Record<string, any>,
  ): void {
    this.logMessage('silly', input, prefix, metadata);
  }
}
