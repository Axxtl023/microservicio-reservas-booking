import type { proveedores } from '@prisma/client';

export type { proveedores as ProveedorPrisma };

export interface IProveedoresRepository {
  findAll(search?: string): Promise<proveedores[]>;
  findById(id: string): Promise<proveedores | null>;
  create(data: { nombre: string; url_api_base: string; activo?: boolean }): Promise<proveedores>;
  update(id: string, data: { nombre?: string; url_api_base?: string; activo?: boolean }): Promise<proveedores>;
  delete(id: string): Promise<void>;
}

export const IPROVEEDORES_REPOSITORY = 'IPROVEEDORES_REPOSITORY';
