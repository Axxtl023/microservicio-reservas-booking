import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn, IsISO8601, IsOptional } from 'class-validator';
import { RESERVA_STATUS } from '../constants/reserva-status.constants';

export class CheckoutDto {
  @ApiProperty() @IsString() idCarrito!: string;
  @ApiProperty() @IsString() metodoPagoId!: string;
  @ApiProperty({ default: 'USD' }) @IsString() @IsOptional() currency?: string;
  @ApiProperty({ required: false, example: '2026-06-01T10:00:00.000Z' }) @IsISO8601() @IsOptional() fechaInicio?: string;
  @ApiProperty({ required: false, example: '2026-06-05T10:00:00.000Z' }) @IsISO8601() @IsOptional() fechaFin?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() agenciaId?: string;
}

export class UpdateEstadoDto {
  @ApiProperty({ enum: Object.values(RESERVA_STATUS) })
  @IsString()
  @IsIn(Object.values(RESERVA_STATUS))
  status!: string;
}

export class DetalleReservaResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ required: false }) idProveedor?: string;
  @ApiProperty({ required: false }) idExterno?: string;
  @ApiProperty({ required: false }) idExternoCodigo?: string;
  @ApiProperty({ required: false }) nombreProveedor?: string;
  @ApiProperty() cantidad!: number;
  @ApiProperty() precioUnitario!: number;
}

export class ReservaResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() idCliente!: string;
  @ApiProperty() total!: number;
  @ApiProperty() status!: string;
  @ApiProperty() fechaReserva!: Date;
  @ApiProperty({ type: [DetalleReservaResponseDto] }) detalles!: DetalleReservaResponseDto[];
}
