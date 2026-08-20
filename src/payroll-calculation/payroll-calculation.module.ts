import { Module } from '@nestjs/common';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollCalculationController } from './payroll-calculation.controller';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [FirebaseModule],
  controllers: [PayrollCalculationController],
  providers: [PayrollCalculationService],
})
export class PayrollCalculationModule {}
