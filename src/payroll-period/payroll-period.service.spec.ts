import { Test, TestingModule } from '@nestjs/testing';
import { PayrollPeriodService } from './payroll-period.service';

describe('PayrollPeriodService', () => {
  let service: PayrollPeriodService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayrollPeriodService],
    }).compile();

    service = module.get<PayrollPeriodService>(PayrollPeriodService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
