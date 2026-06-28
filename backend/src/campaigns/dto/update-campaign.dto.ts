import { IsString, IsOptional, IsNumber, MinLength, MaxLength, Min } from 'class-validator';

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyBudget?: number;

  @IsOptional()
  data?: any;
}
