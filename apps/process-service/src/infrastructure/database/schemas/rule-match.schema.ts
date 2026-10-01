import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class RuleMatch extends Document {
  @Prop({ required: true, type: String })
  eventId: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Rule' })
  ruleId: string;

  @Prop({ required: true, type: String })
  agentId: string;

  @Prop({ required: true, type: Date })
  occurredAt: Date;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  ruleSnapshot: any;
}

export const RuleMatchSchema = SchemaFactory.createForClass(RuleMatch);

// Compound Unique Index for idempotency
RuleMatchSchema.index({ eventId: 1, ruleId: 1 }, { unique: true });

// Covered Candidate Index for Time-Range Report
RuleMatchSchema.index({ ruleId: 1, occurredAt: 1, agentId: 1 });
