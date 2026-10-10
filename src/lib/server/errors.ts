export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new AppError("not_found", `${what} not found`, 404);
export const unauthorized = () => new AppError("unauthorized", "Sign in to continue", 401);
export const forbidden = (msg = "Not allowed") => new AppError("forbidden", msg, 403);
