import { Module } from '@nestjs/common';

import { AttendanceRegularizationController } from './attendance-regularization.controller';
import { AttendanceRegularizationService } from './attendance-regularization.service';
import { FirebaseModule } from 'src/firebase/firebase.module';

@Module({
  imports: [FirebaseModule],
  controllers: [AttendanceRegularizationController],

  providers: [AttendanceRegularizationService],

  exports: [AttendanceRegularizationService],
})
export class AttendanceRegularizationModule {}
