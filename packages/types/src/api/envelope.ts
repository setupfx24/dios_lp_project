export interface ApiSuccess<T> {
  readonly success: true;
  readonly data: T;
  readonly requestId: string;
}

export interface ApiError {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  };
  readonly requestId: string;
  readonly timestamp: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginatedResponse<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly total?: number;
}

export interface PaginationParams {
  readonly cursor?: string;
  readonly limit?: number;
}
