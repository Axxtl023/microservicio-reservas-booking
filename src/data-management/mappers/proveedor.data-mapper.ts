import type { proveedores } from '@prisma/client';
import type { ProveedorDataModel, ProveedorTipo } from '../models/proveedor.data-model';

export class ProveedorDataMapper {
  static toDataModel(entity: proveedores): ProveedorDataModel {
    return {
      id: entity.id,
      nombre: entity.nombre,
      tipo: entity.tipo as ProveedorTipo,
      urlApiBase: entity.url_api_base,
      activo: entity.activo ?? true,
      createdAt: entity.created_at ?? null,
    };
  }

  static toDataModelList(entities: proveedores[]): ProveedorDataModel[] {
    return entities.map((e) => this.toDataModel(e));
  }
}
