import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength } from 'class-validator';

export class CreateCategoriaDto {
  @ApiProperty() @IsString() @MinLength(2) nombre: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() descripcion?: string;
}

export class UpdateCategoriaDto {
  @ApiProperty({ required: false }) @IsString() @MinLength(2) @IsOptional() nombre?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() descripcion?: string;
}

export class CategoriaResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() nombre: string;
  @ApiProperty({ required: false }) descripcion?: string;
  @ApiProperty() createdAt: Date;
}
