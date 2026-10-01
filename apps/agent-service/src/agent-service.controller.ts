import { Controller, Get } from '@nestjs/common';
import { AgentServiceService } from './agent-service.service';

@Controller()
export class AgentServiceController {
  constructor(private readonly agentServiceService: AgentServiceService) {}

  @Get()
  getHello(): string {
    return this.agentServiceService.getHello();
  }
}
