import { Test, TestingModule } from '@nestjs/testing';
import { SalaryAssignmentController } from './salary-assignment.controller';

describe('SalaryAssignmentController', () => {
  let controller: SalaryAssignmentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalaryAssignmentController],
    }).compile();

    controller = module.get<SalaryAssignmentController>(SalaryAssignmentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
