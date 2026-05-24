export interface DetalleReservaDataModel {
  id: string;
  idReserva: string | null;
  idProveedor: string | null;
  idExterno: string | null;
  idExternoCodigo: string | null;
  nombreProveedor: string | null;
  cantidad: number;
  precioUnitario: number;
  createdAt: Date | null;
}

export interface ReservaDataModel {
  id: string;
  idCliente: string | null;
  total: number;
  fechaReserva: Date | null;
  createdAt: Date | null;
  status: string | null;
  detalles: DetalleReservaDataModel[];
}
