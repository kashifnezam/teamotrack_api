import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class HolidayDto {
    @IsString()
    name!: string;

    @IsString()
    date!: string;

    @IsOptional()
    @IsString()
    type?: string;

    @IsOptional()
    @IsBoolean()
    isOptional?: boolean;

    @IsOptional()
    @IsString()
    description?: string;
}