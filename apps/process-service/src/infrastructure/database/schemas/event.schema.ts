import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Event extends Document {
  @Prop({ required: true, unique: true, type: String })
  eventId: string;

  @Prop({ required: true, type: String })
  agentId: string;

  @Prop({ required: true, type: Date })
  occurredAt: Date;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: Number })
  value: number;
}

export const EventSchema = SchemaFactory.createForClass(Event);
