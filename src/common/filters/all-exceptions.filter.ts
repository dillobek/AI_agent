import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppConfigService } from '../../config/app-config.service';

/**
 * Global exception filter.
 * Gracefully handles errors coming from Google APIs, Gemini LLM calls,
 * Telegram/Telegraf, Prisma, and any generic uncaught exception — and,
 * critically, never leaks internal error messages or stack traces to the
 * client in production. 4xx HttpExceptions (validation errors, "not
 * found", "unauthorized", etc.) still return their real message, since
 * those are meant for the caller; only 5xx / non-HttpException failures
 * are generalized in production.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly config?: AppConfigService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    // HTTP response helpers do not exist in RPC/Telegraf contexts. Those
    // integrations own their response/error lifecycle, so only log here.
    if (host.getType<string>() !== 'http') {
      this.logger.error(
        `[${host.getType<string>()}] ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as any).requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';
    let errorSource = 'unknown';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
      errorSource = 'http';
    } else if (this.isGoogleApiError(exception)) {
      status = HttpStatus.BAD_GATEWAY;
      message = 'Google API (Drive/Gmail) request failed';
      errorSource = 'google-api';
    } else if (this.isGeminiError(exception)) {
      status = HttpStatus.BAD_GATEWAY;
      message = 'Gemini AI engine request failed';
      errorSource = 'gemini';
    } else if (exception instanceof Error) {
      message = exception.message;
      errorSource = 'internal';
    }

    // Full detail always goes to the server log (for operators); the
    // client only gets full detail for HttpExceptions (4xx, deliberately
    // thrown with a safe message) or when not running in production.
    this.logger.error(
      `[${requestId ?? '-'}] [${errorSource}] ${request.method} ${request.url} -> ${JSON.stringify(message)}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    const isProduction = this.config?.isProduction ?? process.env.NODE_ENV === 'production';
    const isServerError = status >= 500;
    const safeMessage = isProduction && isServerError ? 'Internal server error' : message;

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
      message: safeMessage,
    });
  }

  private isGoogleApiError(exception: unknown): boolean {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      ('code' in exception || 'errors' in exception) &&
      JSON.stringify(exception).toLowerCase().includes('google')
    );
  }

  private isGeminiError(exception: unknown): boolean {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      JSON.stringify(exception).toLowerCase().includes('gemini')
    );
  }
}
