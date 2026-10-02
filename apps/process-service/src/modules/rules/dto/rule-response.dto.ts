import { ApiProperty } from '@nestjs/swagger';
import { RuleConditionDto } from './create-rule.dto';

export class RuleResponseDto {
  @ApiProperty({
    description: 'MongoDB ObjectId of the rule',
    example: '6ac0102c240d4e5320f43ec5',
  })
  _id: string;

  @ApiProperty({
    description: 'Name describing the purpose of the rule',
    example: 'High Value Alert',
  })
  name: string;

  @ApiProperty({
    description: 'Ordered list of rule evaluation conditions (conjunction/AND)',
    type: [RuleConditionDto],
  })
  conditions: RuleConditionDto[];

  @ApiProperty({
    description: 'Whether this rule is actively evaluated against incoming events',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Timestamp when the rule was created',
    example: '2026-10-02T20:12:28.679Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Timestamp when the rule was last updated',
    example: '2026-10-02T20:12:28.679Z',
  })
  updatedAt: string;
}
