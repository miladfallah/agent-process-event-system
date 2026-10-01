import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
export class LeaderboardCounterId {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Rule' })
  ruleId: string;

  @Prop({ required: true, type: String })
  agentId: string;
}

@Schema({ timestamps: true })
export class LeaderboardCounter extends Document {
  @Prop({ type: LeaderboardCounterId, required: true })
  _id: LeaderboardCounterId;

  @Prop({ required: true, type: Number, default: 0 })
  count: number;
}

export const LeaderboardCounterSchema = SchemaFactory.createForClass(LeaderboardCounter);
