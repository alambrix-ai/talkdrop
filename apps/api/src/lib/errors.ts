export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toErrorPayload(err: unknown): {
  statusCode: number;
  body: { error: { code: string; message: string; details?: unknown } };
} {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      body: { error: { code: err.code, message: err.message, details: err.details } },
    };
  }
  console.error(err);
  return {
    statusCode: 500,
    body: { error: { code: 'internal_error', message: 'Something went wrong' } },
  };
}
