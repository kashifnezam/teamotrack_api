import { IsOptional, IsString } from 'class-validator';

export class TeamDto {

    @IsString()
    name!: string;

    @IsOptional()
    @IsString()
    leadId?: string;

    @IsOptional()
    @IsString()
    shiftId?: string;

}