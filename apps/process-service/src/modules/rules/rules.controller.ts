import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { RulesService } from './rules.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

@Controller('rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Post()
  async create(@Body() createDto: CreateRuleDto) {
    return this.rulesService.create(createDto);
  }

  @Get()
  async findAll(@Query('limit') limit = 10, @Query('offset') offset = 0) {
    return this.rulesService.findAll(Number(limit), Number(offset));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.rulesService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updateDto: UpdateRuleDto) {
    return this.rulesService.update(id, updateDto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.rulesService.delete(id);
  }
}
