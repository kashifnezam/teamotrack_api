import { Module } from '@nestjs/common';
import { SalaryAssignmentController } from './salary-assignment.controller';
import { SalaryAssignmentService } from './salary-assignment.service';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [FirebaseModule],
  controllers: [SalaryAssignmentController],
  providers: [SalaryAssignmentService]
})
export class SalaryAssignmentModule {}
