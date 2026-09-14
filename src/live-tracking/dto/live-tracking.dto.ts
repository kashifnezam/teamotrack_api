import { IsDateString, IsString } from 'class-validator';

export class LiveTrackingDto {
  @IsString()
  executiveId!: string;

  @IsDateString()
  date!: string;
}
