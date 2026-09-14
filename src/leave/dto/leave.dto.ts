import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class LeaveDto {
  @IsString()
  leaveTypeId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsIn([
    'day',
    'half_day',
    'hour',
  ])
  durationUnit?: string;

  /*
   * Required when durationUnit = half_day.
   *
   * first_half  = First Half
   * second_half = Second Half
   */
  @ValidateIf((dto) => dto.durationUnit === 'half_day')
  @IsIn([
    'first_half',
    'second_half',
  ])
  halfDay?: string;

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