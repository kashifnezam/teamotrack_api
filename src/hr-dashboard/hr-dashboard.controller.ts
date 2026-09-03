import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

import { HrDashboardService } from './hr-dashboard.service';

@Controller('hr-dashboard')
export class HrDashboardController {
  constructor(private readonly service: HrDashboardService) {}

  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  async me(@CurrentUser() user: any, @Query('date') date?: string) {
    return this.service.getDashboardData(user, date);
  }
}
