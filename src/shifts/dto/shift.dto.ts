import {
    IsArray,
    IsInt,
    IsString,
    Min,
} from 'class-validator';

export class ShiftDto {

    @IsString()
    name!: string;

    @IsInt()
    @Min(0)
    startHour!: number;

    @IsInt()
    @Min(0)
    startMinute!: number;

    @IsInt()
    @Min(0)
    endHour!: number;

    @IsInt()
    @Min(0)
    endMinute!: number;

    @IsInt()
    @Min(0)
    graceMinutes!: number;

    @IsInt()
    @Min(0)
    halfDayMinutes!: number;

    @IsInt()
    @Min(0)
    fullDayMinutes!: number;

    @IsArray()
    weeklyOff!: number[];
}