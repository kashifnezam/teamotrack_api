import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { FirebaseService } from '../firebase/firebase.service';

@Module({
  controllers: [DashboardController],
  providers: [
    DashboardService,
    FirebaseService,
  ],
})
export class DashboardModule {}