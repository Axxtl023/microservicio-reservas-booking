import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsUrl } from 'class-validator';

export class CreateProveedorDto {
  @ApiProperty() @IsString() nombre: string;
  @ApiProperty() @IsUrl() url_api_base: string;
  @ApiProperty({ required: false }) @IsBoolean() @IsOptional() activo?: boolean;
}

export class UpdateProveedorDto {
  @ApiProperty({ required: false }) @IsString() @IsOptional() nombre?: string;
  @ApiProperty({ required: false }) @IsUrl() @IsOptional() url_api_base?: string;
  @ApiProperty({ required: false }) @IsBoolean() @IsOptional() activo?: boolean;
}

export class ProveedorResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() nombre: string;
  @ApiProperty() urlApiBase: string;
  @ApiProperty() activo: boolean;
  @ApiProperty() createdAt: Date;
}
