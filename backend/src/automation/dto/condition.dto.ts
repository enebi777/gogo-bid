import { IsIn, IsString, IsNotEmpty } from 'class-validator';
import { CONDITION_OPERATORS, ConditionOperator } from '../automation.constants';

export class ConditionDto {
  @IsString()
  @IsNotEmpty()
  field: string;

  @IsIn(CONDITION_OPERATORS)
  operator: ConditionOperator;

  // Conditions compare against event payload values, which are numbers for
  // metrics and strings for identifiers/statuses — so this stays untyped
  // beyond "must be present". A decorator is required even for that: with
  // whitelist+forbidNonWhitelisted enabled globally, class-validator drops
  // (and then rejects) any property with zero decorators, number or not.
  @IsNotEmpty()
  value: number | string;
}
