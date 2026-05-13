import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsNumber, Min } from 'class-validator';

export class AddItemDto {
  @ApiProperty() @IsString() idProductoExterno!: string;
  @ApiProperty() @IsInt() @Min(1) cantidad!: number;
  @ApiProperty() @IsNumber() @Min(0) precioUnitario!: number;
}

export class UpdateItemCantidadDto {
  @ApiProperty() @IsInt() @Min(1) cantidad!: number;
}

export class ItemCarritoResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() idProductoExterno!: string;
  @ApiProperty() cantidad!: number;
  @ApiProperty() precioUnitario!: number;
}

export class CarritoResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() idCliente!: string;
  @ApiProperty() estado!: string;
  @ApiProperty() total!: number;
  @ApiProperty({ type: [ItemCarritoResponseDto] }) items!: ItemCarritoResponseDto[];
}
