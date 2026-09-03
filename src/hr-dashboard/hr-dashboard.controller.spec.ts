import { Test, TestingModule } from '@nestjs/testing';
import { HrDashboardController } from './hr-dashboard.controller';

describe('HrDashboardController', () => {
  let controller: HrDashboardController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HrDashboardController],
    }).compile();

    controller = module.get<HrDashboardController>(HrDashboardController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
