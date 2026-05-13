export interface ItemCarritoDataModel {
  id: string;
  idCarrito: string | null;
  idProductoExterno: string | null;
  cantidad: number;
  precioUnitario: number;
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
