import { Test, TestingModule } from '@nestjs/testing';
import { LiveTrackingController } from './live-tracking.controller';

describe('LiveTrackingController', () => {
  let controller: LiveTrackingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LiveTrackingController],
    }).compile();

    controller = module.get<LiveTrackingController>(LiveTrackingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
