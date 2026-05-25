import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsNumber, Min, IsUUID, IsOptional, IsObject } from 'class-validator';

export class AddItemDto {
  @ApiProperty({
    description: 'UUID del proveedor (de tabla proveedores). Obtenido por el FE desde GET /api/v1/proveedores/publico',
    example: '11111111-0001-4000-8000-000000000001',
  })
  @IsUUID()
  idProveedor!: string;

  @ApiProperty() @IsString() idProductoExterno!: string;
  @ApiProperty() @IsString() nombreProducto!: string;
  @ApiProperty() @IsInt() @Min(1) cantidad!: number;
  @ApiProperty() @IsNumber() @Min(0) precioUnitario!: number;

  // Parámetros de reserva específicos del tipo de proveedor.
  // VEHICLE:    { agenciaId, fechaInicio, fechaFin }
  // FLIGHT:     { flightClassId, passengers[] }   (futuro)
  // HOTEL:      { checkIn, checkOut, habitaciones[] }   (futuro)
  // ATTRACTION: { slotId, tickets[] }   (futuro)
  @ApiProperty({
    required: false,
    description: 'Metadata por-item con parámetros de reserva (fechas, agencia, asientos, etc) según tipo de proveedor',
    example: { agenciaId: 'uuid', fechaInicio: '2026-06-01T10:00:00Z', fechaFin: '2026-06-05T10:00:00Z' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateItemCantidadDto {
  @ApiProperty() @IsInt() @Min(1) cantidad!: number;
}

export class ItemCarritoResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) idProveedor!: string | null;
  @ApiProperty() idProductoExterno!: string;
  @ApiProperty() nombreProducto!: string;
  @ApiProperty() cantidad!: number;
  @ApiProperty() precioUnitario!: number;
  @ApiProperty({ required: false, nullable: true }) metadata?: Record<string, unknown> | null;
}

export class CarritoResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() idCliente!: string;
  @ApiProperty() estado!: string;
  @ApiProperty() total!: number;
  @ApiProperty({ type: [ItemCarritoResponseDto] }) items!: ItemCarritoResponseDto[];
}
