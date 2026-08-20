import {
    IsDateString,
    IsString,
} from 'class-validator';

export class SalaryAssignmentDto {

    @IsString()
    employeeId!: string;

    @IsString()
    salaryStructureId!: string;

    @IsDateString()
    effectiveFrom!: string;

}