import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { FirebaseService } from '../firebase/firebase.service';
import { HolidayService } from 'src/holiday/holiday.service';
import { LeaveService } from 'src/leave/leave.service';

@Module({
  controllers: [DashboardController],
  providers: [
    DashboardService,
    FirebaseService,
    HolidayService,
    LeaveService
  ],
})
export class DashboardModule {}