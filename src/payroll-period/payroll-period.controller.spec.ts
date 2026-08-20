import { Test, TestingModule } from '@nestjs/testing';
import { PayrollPeriodController } from './payroll-period.controller';

describe('PayrollPeriodController', () => {
  let controller: PayrollPeriodController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayrollPeriodController],
    }).compile();

    controller = module.get<PayrollPeriodController>(PayrollPeriodController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
