import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Rule } from '../../infrastructure/database/schemas/rule.schema';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { REDIS_CLIENT } from '../../infrastructure/cache/cache.module';
import { Redis } from 'ioredis';

@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name);

  constructor(
    @InjectModel(Rule.name) private readonly ruleModel: Model<Rule>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async create(createDto: CreateRuleDto): Promise<Rule> {
    const rule = new this.ruleModel(createDto);
    const saved = await rule.save();
    await this.broadcastInvalidation();
    return saved;
  }

  async findAll(limit = 10, offset = 0): Promise<{ data: Rule[]; total: number }> {
    const [data, total] = await Promise.all([
      this.ruleModel.find().skip(offset).limit(limit).exec(),
      this.ruleModel.countDocuments().exec(),
    ]);
    return { data, total };
  }

  async findOne(id: string): Promise<Rule> {
    const rule = await this.ruleModel.findById(id).exec();
    if (!rule) throw new NotFoundException(`Rule ${id} not found`);
    return rule;
  }

  async update(id: string, updateDto: UpdateRuleDto): Promise<Rule> {
    const rule = await this.ruleModel.findByIdAndUpdate(id, updateDto, { new: true }).exec();
    if (!rule) throw new NotFoundException(`Rule ${id} not found`);
    await this.broadcastInvalidation();
    return rule;
  }

  async delete(id: string): Promise<void> {
    const rule = await this.ruleModel.findByIdAndDelete(id).exec();
    if (!rule) throw new NotFoundException(`Rule ${id} not found`);
    await this.broadcastInvalidation();
  }

  private async broadcastInvalidation() {
    try {
      await this.redis.publish('rules:invalidated', Date.now().toString());
    } catch (e) {
      this.logger.error('Failed to publish rule invalidation', e);
    }
  }

  async getActiveRules(): Promise<Rule[]> {
    return this.ruleModel.find({ isActive: true }).lean().exec();
  }
}
