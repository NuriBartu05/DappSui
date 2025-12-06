import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  status?: number;
  details?: any;
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('❌ Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  const status = err.status || 500;
  const message = err.message || 'Internal server error';

  res.status(status).json({
    error: message,
    details: err.details || undefined,
    timestamp: new Date().toISOString(),
    path: req.path,
  });
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
    suggestion: 'Check /api for available endpoints',
  });
}

/**
 * Async route handler wrapper to catch errors
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create an application error
 */
export function createError(message: string, status: number = 500, details?: any): AppError {
  const error: AppError = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}
