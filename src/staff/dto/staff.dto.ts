import {
    IsBoolean,
    IsEmail,
    IsOptional,
    IsString,
    MinLength,
} from 'class-validator';

export class StaffDto {

    @IsString()
    fullName!: string;

    @IsEmail()
    email!: string;

    @IsOptional()
    @IsString()
    mobile?: string;

    @IsOptional()
    @IsString()
    @MinLength(6)
    password?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsString()
    @IsOptional()
    parentId?: string;

    @IsOptional()
    @IsString()
    shiftId?: string;
}