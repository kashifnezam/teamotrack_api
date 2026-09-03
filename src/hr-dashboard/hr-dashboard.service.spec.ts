import { Test, TestingModule } from '@nestjs/testing';
import { HrDashboardService } from './hr-dashboard.service';

describe('HrDashboardService', () => {
  let service: HrDashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HrDashboardService],
    }).compile();

    service = module.get<HrDashboardService>(HrDashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
