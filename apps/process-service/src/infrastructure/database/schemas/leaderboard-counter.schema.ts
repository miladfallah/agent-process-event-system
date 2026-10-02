import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export interface LeaderboardCounterId {
  ruleId: string;
  agentId: string;
}

@Schema({ timestamps: true })
export class LeaderboardCounter {
  @Prop({ type: { ruleId: MongooseSchema.Types.ObjectId, agentId: String }, required: true })
  _id: LeaderboardCounterId;

  @Prop({ required: true, type: Number, default: 0 })
  count: number;
}

export type LeaderboardCounterDocument = HydratedDocument<LeaderboardCounter>;
export const LeaderboardCounterSchema = SchemaFactory.createForClass(LeaderboardCounter);
