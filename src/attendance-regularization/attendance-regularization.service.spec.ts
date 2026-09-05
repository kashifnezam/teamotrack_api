import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceRegularizationService } from './attendance-regularization.service';

describe('AttendanceRegularizationService', () => {
  let service: AttendanceRegularizationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AttendanceRegularizationService],
    }).compile();

    service = module.get<AttendanceRegularizationService>(AttendanceRegularizationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
