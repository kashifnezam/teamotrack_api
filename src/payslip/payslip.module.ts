import { Module } from '@nestjs/common';
import { PayslipController } from './payslip.controller';
import { PayslipService } from './payslip.service';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [FirebaseModule],
  controllers: [PayslipController],
  providers: [PayslipService]
})
export class PayslipModule {}
