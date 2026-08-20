import { Test, TestingModule } from '@nestjs/testing';
import { SalaryAssignmentService } from './salary-assignment.service';

describe('SalaryAssignmentService', () => {
  let service: SalaryAssignmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SalaryAssignmentService],
    }).compile();

    service = module.get<SalaryAssignmentService>(SalaryAssignmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
