import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { IAuditoriaService } from '../interfaces/i-auditoria.service';
import { IAUDITORIA_SERVICE } from '../interfaces/i-auditoria.service';
import type { Request } from 'express';

@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  constructor(@Inject(IAUDITORIA_SERVICE) private readonly auditoriaService: IAuditoriaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: { sub?: string } }>();
    const method = req.method;

    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        const tabla = req.path.split('/')[3] ?? 'unknown';
        const accion = method;
        const idUsuario = req.user?.sub;
        const ip = req.ip;

        this.auditoriaService.registrar({ idUsuario, accion, tabla, ip }).catch(() => {});
      }),
    );
  }
}
