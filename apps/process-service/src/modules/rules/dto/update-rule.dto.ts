import { IsString, IsBoolean, IsArray, ValidateNested, ArrayMinSize, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { RuleConditionDto } from './create-rule.dto';

export class UpdateRuleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  @ArrayMinSize(1)
  @IsOptional()
  conditions?: RuleConditionDto[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
