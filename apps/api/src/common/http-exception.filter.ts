import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/** Uniform error envelope: { statusCode, error, message, path, timestamp }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = { message: 'Internal server error' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      body = typeof r === 'string' ? { message: r } : (r as Record<string, unknown>);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        body = { message: 'Resource not found' };
      } else if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        body = { message: 'Resource already exists' };
      }
    }

    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : exception);

    res.status(status).json({
      statusCode: status,
      ...body,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
