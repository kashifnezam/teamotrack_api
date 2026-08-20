import { Test, TestingModule } from '@nestjs/testing';
import { SalaryStructureController } from './salary-structure.controller';

describe('SalaryStructureController', () => {
  let controller: SalaryStructureController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalaryStructureController],
    }).compile();

    controller = module.get<SalaryStructureController>(SalaryStructureController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
