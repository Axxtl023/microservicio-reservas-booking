import type { categorias } from '@prisma/client';
import type { CategoriaDataModel } from '../models/categoria.data-model';

export class CategoriaDataMapper {
  static toDataModel(entity: categorias): CategoriaDataModel {
    return {
      id: entity.id,
      nombre: entity.nombre,
      descripcion: entity.descripcion ?? null,
      createdAt: entity.created_at ?? null,
    };
  }

  static toDataModelList(entities: categorias[]): CategoriaDataModel[] {
    return entities.map((e) => this.toDataModel(e));
  }
}
