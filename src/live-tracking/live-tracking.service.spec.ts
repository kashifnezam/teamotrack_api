import { Test, TestingModule } from '@nestjs/testing';
import { LiveTrackingService } from './live-tracking.service';

describe('LiveTrackingService', () => {
  let service: LiveTrackingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LiveTrackingService],
    }).compile();

    service = module.get<LiveTrackingService>(LiveTrackingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
