import {
    IsBoolean,
    IsEmail,
    IsIn,
    IsOptional,
    IsString,
} from 'class-validator';

export class ExecutiveDto {

    @IsString()
    fullName!: string;


    @IsString()
    mobile!: string;


    @IsEmail()
    @IsOptional()
    email?: string;


    @IsString()
    @IsOptional()
    password?: string;


    @IsString()
    teamId!: string;


    @IsBoolean()
    isActive!: boolean;


    @IsBoolean()
    isTrackingEnable!: boolean;


    @IsIn(['low', 'high'])
    @IsOptional()
    gpsPriority?: string;

}