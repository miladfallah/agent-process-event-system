import { Test, TestingModule } from '@nestjs/testing';
import { AgentServiceController } from './agent-service.controller';
import { AgentServiceService } from './agent-service.service';

describe('AgentServiceController', () => {
  let agentServiceController: AgentServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AgentServiceController],
      providers: [AgentServiceService],
    }).compile();

    agentServiceController = app.get<AgentServiceController>(AgentServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(agentServiceController.getHello()).toBe('Hello World!');
    });
  });
});
