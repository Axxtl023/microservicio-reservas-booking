import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';

export class CheckoutDto {
  @ApiProperty() @IsString() idCarrito!: string;
}

export class UpdateEstadoDto {
  @ApiProperty({ enum: ['PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'COMPLETADA'] })
  @IsString()
  @IsIn(['PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'COMPLETADA'])
  status!: string;
}

export class DetalleReservaResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ required: false }) idProveedor?: string;
  @ApiProperty() idExterno!: string;
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
