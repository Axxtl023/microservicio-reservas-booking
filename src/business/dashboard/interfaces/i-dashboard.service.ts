export interface VentasPorProveedorQuery {
  desde: Date;
  hasta: Date;
}

export interface VentasTotalesTipo {
  revenue: number;
  confirmadas: number;
  canceladas: number;
  pendientes: number;
}

export interface VentasProveedor {
  id: string;
  nombre: string;
  tipo: string;
  activo: boolean;
  revenue: number;
  confirmadas: number;
  canceladas: number;
  pendientes: number;
  ticketPromedio: number;
  cancelRate: number;
  ultimaVenta: string | null;
}

export interface VentasPorProveedorResponse {
  rango: { desde: string; hasta: string };
  totalesPorTipo: Record<string, VentasTotalesTipo>;
  proveedores: VentasProveedor[];
}

export interface IDashboardService {
  ventasPorProveedor(query: VentasPorProveedorQuery): Promise<VentasPorProveedorResponse>;
}

export const IDASHBOARD_SERVICE = 'IDASHBOARD_SERVICE';
