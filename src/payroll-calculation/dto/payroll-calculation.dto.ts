import {
    IsString,
} from 'class-validator';

export class PayrollCalculationDto {

    @IsString()
    payrollPeriodId!: string;

}