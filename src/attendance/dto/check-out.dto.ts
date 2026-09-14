import { IsLatitude, IsLongitude, IsNumber, IsString, IsOptional } from 'class-validator';

export class CheckOutDto {
  @IsOptional()
  @IsNumber()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsNumber()
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsString()
  selfieUrl?: string;
}

export class CorrectCheckOutDto {
  @IsString()
  staffId!: string;

  @IsString()
  checkOutTime!: string;

  @IsString()
  reason!: string;
}
