import {IsNumber, IsOptional, IsString } from 'class-validator';

export class CheckInDto {
  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  selfieUrl?: string;
}
