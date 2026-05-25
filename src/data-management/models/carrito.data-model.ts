export interface ItemCarritoDataModel {
  id: string;
  idCarrito: string | null;
  idProveedor: string | null;
  idProductoExterno: string | null;
  nombreProducto: string | null;
  cantidad: number;
  precioUnitario: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date | null;
}

export interface CarritoDataModel {
  id: string;
  idCliente: string | null;
  estado: string;
  total: number;
  createdAt: Date | null;
  items: ItemCarritoDataModel[];
}
