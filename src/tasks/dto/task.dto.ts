import {
    IsBoolean,
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
} from 'class-validator';

export class TaskDto {

    @IsString()
    title!: string;

    @IsString()
    description!: string;

    @IsIn(['Low', 'Medium', 'High'])
    priority!: string;

    @IsString()
    startDate!: string;

    @IsString()
    endDate!: string;

    @IsBoolean()
    @IsOptional()
    isGeofence?: boolean;

    @IsOptional()
    startLocation?: {
        address?: string;
        lat?: number;
        lng?: number;
    };

    @IsOptional()
    endLocation?: {
        address?: string;
        lat?: number;
        lng?: number;
    };

    @IsOptional()
    @IsString()
    assignedTo?: string;
}