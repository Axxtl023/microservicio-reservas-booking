import type { auditoria } from '@prisma/client';

export type { auditoria as AuditoriaPrisma };

export interface CreateAuditoriaData {
  id_usuario?: string;
  accion: string;
  tabla: string;
  detalles?: string;
  ip?: string;
}

export interface IAuditoriaRepository {
  create(data: CreateAuditoriaData): Promise<auditoria>;
  findAll(page: number, limit: number): Promise<{ data: auditoria[]; total: number }>;
}

export const IAUDITORIA_REPOSITORY = 'IAUDITORIA_REPOSITORY';
