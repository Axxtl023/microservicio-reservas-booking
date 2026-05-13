import type { AuditoriaDataModel } from '../../../data-management/models/auditoria.data-model';

export interface IAuditoriaService {
  registrar(data: { idUsuario?: string; accion: string; tabla: string; detalles?: string; ip?: string }): Promise<void>;
  findAll(page: number, limit: number): Promise<{ data: AuditoriaDataModel[]; total: number }>;
}

export const IAUDITORIA_SERVICE = 'IAUDITORIA_SERVICE';
