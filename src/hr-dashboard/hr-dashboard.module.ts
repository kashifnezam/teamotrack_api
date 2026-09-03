import { Module } from '@nestjs/common';

import { HrDashboardController } from './hr-dashboard.controller';
import { HrDashboardService } from './hr-dashboard.service';

import { FirebaseModule } from '../firebase/firebase.module';
import { LeaveService } from 'src/leave/leave.service';
import { HolidayService } from 'src/holiday/holiday.service';

@Module({
  imports: [FirebaseModule],

  controllers: [HrDashboardController],

  providers: [HrDashboardService, LeaveService, HolidayService],

  exports: [HrDashboardService],
})
export class HrDashboardModule {}
