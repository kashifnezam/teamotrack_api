import {
    IsBoolean,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

export class SalaryStructureDto {

    @IsString()
    name!: string;

    @IsNumber()
    @Min(0)
    basic!: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    hra?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    conveyance?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    otherAllowance?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    incentive?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    overtime?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    pf?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    esi?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    tax?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    otherDeduction?: number;

    @IsOptional()
    @IsBoolean()
    active?: boolean;

    @IsOptional()
    @IsString()
    description?: string;
}