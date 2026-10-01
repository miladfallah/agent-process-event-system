import { IsString, IsNotEmpty, IsBoolean, IsArray, ValidateNested, IsEnum, IsNumber, ArrayMinSize, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { Operator } from '../../../infrastructure/database/schemas/rule.schema';

export class RuleConditionDto {
  @IsString()
  @IsNotEmpty()
  field: string;

  @IsEnum(Operator)
  operator: Operator;

  @IsNumber()
  value: number;
}

export class CreateRuleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  @ArrayMinSize(1)
  conditions: RuleConditionDto[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
