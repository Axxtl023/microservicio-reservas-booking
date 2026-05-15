import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { IAuditoriaService } from '../interfaces/i-auditoria.service';
import { IAUDITORIA_SERVICE } from '../interfaces/i-auditoria.service';
import type { Request } from 'express';

const METHOD_ACCION: Record<string, 'CREATE' | 'UPDATE' | 'DELETE'> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  constructor(@Inject(IAUDITORIA_SERVICE) private readonly auditoriaService: IAuditoriaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: { sub?: string } }>();
    const accion = METHOD_ACCION[req.method];

    if (!accion) return next.handle();

    return next.handle().pipe(
      tap(() => {
        const tabla = req.path.split('/')[3] ?? 'unknown';
        const idUsuario = req.user?.sub;
        const ip = req.ip;
        const detalles =
          req.method !== 'DELETE' && req.body && Object.keys(req.body as object).length > 0
            ? JSON.stringify(req.body)
            : undefined;

        this.auditoriaService
          .registrar({ idUsuario, accion, tabla, detalles, ip })
          .catch(() => {});
      }),
    );
  }
}
