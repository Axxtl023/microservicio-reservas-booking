import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsIn } from 'class-validator';
import { PROVEEDOR_TIPOS, type ProveedorTipo } from '../../../data-management/models/proveedor.data-model';

export class CreateProveedorDto {
  @ApiProperty() @IsString() nombre!: string;
  @ApiProperty({ enum: PROVEEDOR_TIPOS, example: 'VEHICLE' }) @IsIn(PROVEEDOR_TIPOS) tipo!: ProveedorTipo;
  @ApiProperty() @IsString() url_api_base!: string;
  @ApiProperty({ required: false }) @IsBoolean() @IsOptional() activo?: boolean;
}

export class UpdateProveedorDto {
  @ApiProperty({ required: false }) @IsString() @IsOptional() nombre?: string;
  @ApiProperty({ required: false, enum: PROVEEDOR_TIPOS }) @IsIn(PROVEEDOR_TIPOS) @IsOptional() tipo?: ProveedorTipo;
  @ApiProperty({ required: false }) @IsString() @IsOptional() url_api_base?: string;
  @ApiProperty({ required: false }) @IsBoolean() @IsOptional() activo?: boolean;
}

export class ProveedorResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty({ enum: PROVEEDOR_TIPOS }) tipo!: ProveedorTipo;
  @ApiProperty() urlApiBase!: string;
  @ApiProperty() activo!: boolean;
  @ApiProperty() createdAt!: Date;
}

// Versión pública: sin url_api_base ni createdAt (info que el FE no necesita
// y que es preferible no exponer fuera del scope admin).
export class ProveedorPublicoDto {
  @ApiProperty() id!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty({ enum: PROVEEDOR_TIPOS }) tipo!: ProveedorTipo;
  @ApiProperty() activo!: boolean;
}
