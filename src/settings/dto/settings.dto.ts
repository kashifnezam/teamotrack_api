import {
    IsBoolean,
    IsOptional,
    IsString,
} from 'class-validator';

export class SettingsDto {

    @IsOptional()
    @IsString()
    fullName?: string;

    @IsOptional()
    @IsString()
    businessName?: string;

    @IsOptional()
    @IsString()
    logo?: string;

    @IsOptional()
    @IsBoolean()
    canCreateTask?: boolean;

    @IsOptional()
    @IsBoolean()
    canEditTask?: boolean;

    @IsOptional()
    @IsBoolean()
    canDeleteTask?: boolean;

    @IsOptional()
    @IsBoolean()
    canApproveLeave?: boolean;

    @IsOptional()
    @IsBoolean()
    canMarkAttendance?: boolean;
}