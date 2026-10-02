import { IsString, IsBoolean, IsArray, ValidateNested, ArrayMinSize, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RuleConditionDto } from './create-rule.dto';

export class UpdateRuleDto {
  @ApiPropertyOptional({
    description: 'Updated name of the rule',
    example: 'Critical Value Alert',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated conditions list for the rule',
    type: [RuleConditionDto],
    minItems: 1,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  @ArrayMinSize(1)
  @IsOptional()
  conditions?: RuleConditionDto[];

  @ApiPropertyOptional({
    description: 'Updated activation status of the rule',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
