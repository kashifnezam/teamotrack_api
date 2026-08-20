import { Module } from '@nestjs/common';
import { PayrollPeriodController } from './payroll-period.controller';
import { PayrollPeriodService } from './payroll-period.service';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [FirebaseModule],
  controllers: [PayrollPeriodController],
  providers: [PayrollPeriodService]
})
export class PayrollPeriodModule {}
