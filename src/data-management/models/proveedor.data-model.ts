export type ProveedorTipo = 'VEHICLE' | 'FLIGHT' | 'HOTEL' | 'ATTRACTION';

export const PROVEEDOR_TIPOS: ProveedorTipo[] = ['VEHICLE', 'FLIGHT', 'HOTEL', 'ATTRACTION'];

export interface ProveedorDataModel {
  id: string;
  nombre: string;
  tipo: ProveedorTipo;
  urlApiBase: string;
  activo: boolean;
  createdAt: Date | null;
}
