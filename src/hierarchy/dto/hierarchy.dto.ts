import {
    IsEmail,
    IsObject,
    IsOptional,
    IsString,
    MinLength,
} from 'class-validator';

export class HierarchyDto {

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

    @IsString()
    role!: string;

    @IsOptional()
    @IsObject()
    permissions?: Record<string, boolean>;

}