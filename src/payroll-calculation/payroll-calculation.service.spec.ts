import { Test, TestingModule } from '@nestjs/testing';
import { PayrollCalculationService } from './payroll-calculation.service';

describe('PayrollCalculationService', () => {
  let service: PayrollCalculationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayrollCalculationService],
    }).compile();

    service = module.get<PayrollCalculationService>(PayrollCalculationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
