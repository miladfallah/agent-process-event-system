import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Operator } from './rule.types';
export { Operator } from './rule.types';

export class RuleCondition {
  @Prop({ required: true })
  field: string;

  @Prop({ required: true, enum: Operator })
  operator: Operator;

  @Prop({ required: true })
  value: number;
}

@Schema({ timestamps: true })
export class Rule extends Document {
  @Prop({ required: true, type: String })
  name: string;

  @Prop({ type: [RuleCondition], required: true })
  conditions: RuleCondition[];

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const RuleSchema = SchemaFactory.createForClass(Rule);
