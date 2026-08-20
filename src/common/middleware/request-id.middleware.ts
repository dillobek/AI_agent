import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

/** Attaches (or propagates) an `x-request-id` for tracing across logs. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
  (req as any).requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
