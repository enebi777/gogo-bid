import { IsString, IsOptional, IsNumber, MinLength, MaxLength, Min } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  offerId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyBudget?: number;

  @IsOptional()
  @IsString()
  integrationAccountId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  // Frontend-managed rich nested object (offer/traffic/targeting/metrics/ai/...).
  // Not validated field-by-field here — see Campaign.data in schema.prisma for why.
  @IsOptional()
  data?: any;
}
