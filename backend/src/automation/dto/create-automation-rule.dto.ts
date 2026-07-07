import { IsString, IsIn, IsOptional, IsBoolean, IsArray, ValidateNested, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { TRIGGER_TYPES, ACTIONS, TriggerType, ActionType } from '../automation.constants';
import { ConditionDto } from './condition.dto';

export class CreateAutomationRuleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  // Null/omitted = applies to every campaign in the org. Set = scoped to one
  // campaign (validated against the caller's org in the service layer).
  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsIn(TRIGGER_TYPES)
  triggerType: TriggerType;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  conditions?: ConditionDto[];

  @IsIn(ACTIONS)
  action: ActionType;

  @IsOptional()
  actionParams?: Record<string, unknown>;
}
