import { IsOptional, IsString } from 'class-validator';

export class TeamDto {
    @IsString()
    name!: string;

    @IsString()
    @IsOptional()
    leadId?: string;

    @IsString()
    @IsOptional()
    shiftId?: string;
}