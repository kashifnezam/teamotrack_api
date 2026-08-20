import {
    IsInt,
    Max,
    Min,
} from 'class-validator';

export class PayrollPeriodDto {

    @IsInt()
    @Min(2000)
    year!: number;

    @IsInt()
    @Min(1)
    @Max(12)
    month!: number;

}