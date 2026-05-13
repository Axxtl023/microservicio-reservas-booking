import type { CategoriaDataModel } from '../../../data-management/models/categoria.data-model';

export interface ICategoriasService {
  findAll(): Promise<CategoriaDataModel[]>;
  findById(id: string): Promise<CategoriaDataModel>;
  create(data: { nombre: string; descripcion?: string }): Promise<CategoriaDataModel>;
  update(id: string, data: { nombre?: string; descripcion?: string }): Promise<CategoriaDataModel>;
  delete(id: string): Promise<void>;
}

export const ICATEGORIAS_SERVICE = 'ICATEGORIAS_SERVICE';
