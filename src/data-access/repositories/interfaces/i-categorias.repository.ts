import type { categorias } from '@prisma/client';

export type { categorias as CategoriaPrisma };

export interface ICategoriasRepository {
  findAll(): Promise<categorias[]>;
  findById(id: string): Promise<categorias | null>;
  findByNombre(nombre: string): Promise<categorias | null>;
  create(data: { nombre: string; descripcion?: string }): Promise<categorias>;
  update(id: string, data: { nombre?: string; descripcion?: string }): Promise<categorias>;
  delete(id: string): Promise<void>;
}

export const ICATEGORIAS_REPOSITORY = 'ICATEGORIAS_REPOSITORY';
