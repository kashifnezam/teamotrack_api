import { Module } from '@nestjs/common';
import { SalaryStructureController } from './salary-structure.controller';
import { SalaryStructureService } from './salary-structure.service';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [FirebaseModule],
  controllers: [SalaryStructureController],
  providers: [SalaryStructureService]
})
export class SalaryStructureModule {}
