import type { ProveedorDataModel } from '../../../data-management/models/proveedor.data-model';

export interface IProveedoresService {
  findAll(search?: string): Promise<ProveedorDataModel[]>;
  findById(id: string): Promise<ProveedorDataModel>;
  create(data: { nombre: string; url_api_base: string; activo?: boolean }): Promise<ProveedorDataModel>;
  update(id: string, data: { nombre?: string; url_api_base?: string; activo?: boolean }): Promise<ProveedorDataModel>;
  delete(id: string): Promise<void>;
}

export const IPROVEEDORES_SERVICE = 'IPROVEEDORES_SERVICE';
