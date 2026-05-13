import type { PaginationMeta } from '../../common/pagination.types';

export class ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  meta?: PaginationMeta;
  error?: string;

  static ok<T>(data: T, message = 'OK'): ApiResponse<T> {
    const r = new ApiResponse<T>();
    r.success = true;
    r.message = message;
    r.data = data;
    return r;
  }

  static paginated<T>(data: T, meta: PaginationMeta, message = 'OK'): ApiResponse<T> {
    const r = new ApiResponse<T>();
    r.success = true;
    r.message = message;
    r.data = data;
    r.meta = meta;
    return r;
  }

  static fail(error: string, message = 'Error'): ApiResponse<null> {
    const r = new ApiResponse<null>();
    r.success = false;
    r.message = message;
    r.error = error;
    return r;
  }
}
