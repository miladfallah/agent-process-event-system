import { IsString, IsNotEmpty, IsBoolean, IsArray, ValidateNested, IsEnum, IsNumber, ArrayMinSize, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Operator } from '../../../infrastructure/database/schemas/rule.schema';

export class RuleConditionDto {
  @ApiProperty({
    description: 'Field name in event payload to evaluate',
    example: 'value',
  })
  @IsString()
  @IsNotEmpty()
  field: string;

  @ApiProperty({
    description: 'Comparison operator to apply',
    enum: Operator,
    enumName: 'Operator',
    example: Operator.GT,
  })
  @IsEnum(Operator)
  operator: Operator;

  @ApiProperty({
    description: 'Numeric reference threshold for comparison',
    example: 50,
  })
  @IsNumber()
  value: number;
}

export class CreateRuleDto {
  @ApiProperty({
    description: 'Human-readable name of the rule',
    example: 'High Value Alert',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'One or more matching conditions evaluated in logical AND',
    type: [RuleConditionDto],
    minItems: 1,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  @ArrayMinSize(1)
  conditions: RuleConditionDto[];

  @ApiPropertyOptional({
    description: 'Activation status of the rule',
    default: true,
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
