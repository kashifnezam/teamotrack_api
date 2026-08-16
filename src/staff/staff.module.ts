import { Module } from '@nestjs/common';
import { ManagersController } from './managers/managers.controller';
import { HrController } from './hr/hr.controller';
import { StaffService } from './staff/staff.service';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [FirebaseModule],
  controllers: [ManagersController, HrController],
  providers: [StaffService]
})
export class StaffModule {}
