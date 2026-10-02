import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { RulesService } from './rules.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { RuleResponseDto } from './dto/rule-response.dto';

@ApiTags('Rules')
@Controller('rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new rule',
    description: 'Registers a new event rule. Automatically broadcasts cache invalidation across all processing nodes via Redis Pub/Sub.',
  })
  @ApiBody({ type: CreateRuleDto })
  @ApiResponse({ status: 201, description: 'Rule created successfully', type: RuleResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input payload or failed validation constraints' })
  async create(@Body() createDto: CreateRuleDto) {
    return this.rulesService.create(createDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List rules',
    description: 'Retrieves a paginated list of configured rules.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10, description: 'Max items to return' })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0, description: 'Items to skip' })
  @ApiResponse({ status: 200, description: 'List of rules retrieved', type: [RuleResponseDto] })
  async findAll(@Query('limit') limit = 10, @Query('offset') offset = 0) {
    return this.rulesService.findAll(Number(limit), Number(offset));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get rule by ID',
    description: 'Retrieves full details of a specific rule by its MongoDB identifier.',
  })
  @ApiParam({ name: 'id', type: String, description: '24-character hexadecimal MongoDB ObjectId', example: '6ac0102c240d4e5320f43ec5' })
  @ApiResponse({ status: 200, description: 'Rule details', type: RuleResponseDto })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  async findOne(@Param('id') id: string) {
    return this.rulesService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update a rule',
    description: 'Modifies fields or conditions of an existing rule, triggering immediate in-memory cache reload via Redis Pub/Sub.',
  })
  @ApiParam({ name: 'id', type: String, description: '24-character hexadecimal MongoDB ObjectId', example: '6ac0102c240d4e5320f43ec5' })
  @ApiBody({ type: UpdateRuleDto })
  @ApiResponse({ status: 200, description: 'Updated rule details', type: RuleResponseDto })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateRuleDto) {
    return this.rulesService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a rule',
    description: 'Removes a rule and notifies engine instances to evict it from active cache.',
  })
  @ApiParam({ name: 'id', type: String, description: '24-character hexadecimal MongoDB ObjectId', example: '6ac0102c240d4e5320f43ec5' })
  @ApiResponse({ status: 200, description: 'Rule deleted successfully', type: RuleResponseDto })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  async delete(@Param('id') id: string) {
    return this.rulesService.delete(id);
  }
}
