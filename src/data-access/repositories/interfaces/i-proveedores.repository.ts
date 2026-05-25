import type { proveedores } from '@prisma/client';
import type { ProveedorTipo } from '../../../data-management/models/proveedor.data-model';

export type { proveedores as ProveedorPrisma };

export interface IProveedoresRepository {
  findAll(search?: string): Promise<proveedores[]>;
  findAllActivosByTipo(tipo: ProveedorTipo): Promise<proveedores[]>;
  findById(id: string): Promise<proveedores | null>;
  findManyByIds(ids: string[]): Promise<proveedores[]>;
  create(data: { nombre: string; tipo: ProveedorTipo; url_api_base: string; activo?: boolean }): Promise<proveedores>;
  update(id: string, data: { nombre?: string; tipo?: ProveedorTipo; url_api_base?: string; activo?: boolean }): Promise<proveedores>;
  delete(id: string): Promise<void>;
}

export const IPROVEEDORES_REPOSITORY = 'IPROVEEDORES_REPOSITORY';
