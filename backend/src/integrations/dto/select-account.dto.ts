import { IsString, MinLength } from 'class-validator';

export class SelectAccountDto {
  @IsString()
  @MinLength(1)
  accountId: string;
}
