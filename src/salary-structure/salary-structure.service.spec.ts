import { Test, TestingModule } from '@nestjs/testing';
import { SalaryStructureService } from './salary-structure.service';

describe('SalaryStructureService', () => {
  let service: SalaryStructureService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SalaryStructureService],
    }).compile();

    service = module.get<SalaryStructureService>(SalaryStructureService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
