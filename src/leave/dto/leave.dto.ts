import {
    IsBoolean,
    IsDateString,
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';


export class LeaveDto {

    @IsString()
    leaveTypeId!: string;


    @IsDateString()
    startDate!: string;


    @IsDateString()
    endDate!: string;


    @IsNumber()
    @Min(0.5)
    days!: number;


    @IsOptional()
    @IsIn([
        'day',
        'half_day',
        'hour',
    ])
    durationUnit?: string;


    @IsOptional()
    @IsString()
    reason?: string;
}


/*
 * Leave type / policy.
 *
 * Used by Root / HR according
 * to permissions.
 */
export class LeaveTypeDto {

    @IsString()
    name!: string;


    @IsString()
    code!: string;


    @IsBoolean()
    isPaid!: boolean;


    @IsBoolean()
    deductSalary!: boolean;


    @IsBoolean()
    requiresApproval!: boolean;


    @IsBoolean()
    allowHalfDay!: boolean;


    @IsOptional()
    @IsNumber()
    @Min(0)
    maxDaysPerRequest?: number;


    @IsOptional()
    @IsNumber()
    @Min(0)
    annualAllocation?: number;


    @IsIn([
        'auto',
        'one_level',
        'two_level',
        'root',
    ])
    approvalMode!: string;
}