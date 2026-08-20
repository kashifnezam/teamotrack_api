import { Test, TestingModule } from '@nestjs/testing';
import { PayrollCalculationController } from './payroll-calculation.controller';
import { PayrollCalculationService } from './payroll-calculation.service';

describe('PayrollCalculationController', () => {
  let controller: PayrollCalculationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayrollCalculationController],
      providers: [PayrollCalculationService],
    }).compile();

    controller = module.get<PayrollCalculationController>(PayrollCalculationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
