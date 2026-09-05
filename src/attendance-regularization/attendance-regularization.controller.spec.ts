import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceRegularizationController } from './attendance-regularization.controller';

describe('AttendanceRegularizationController', () => {
  let controller: AttendanceRegularizationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceRegularizationController],
    }).compile();

    controller = module.get<AttendanceRegularizationController>(AttendanceRegularizationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
