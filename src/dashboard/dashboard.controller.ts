import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';

import { DashboardService } from './dashboard.service';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RoleGuard } from '../auth/role.guard';

import { CurrentUser } from '../auth/current-user.decorator';
import { RestrictRoles } from 'src/auth/roles.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // ==========================================================
  // DASHBOARD DATA
  // ==========================================================

  @Get('me')
  @UseGuards(FirebaseAuthGuard, RoleGuard)
  async me(@CurrentUser() user: any, @Query('date') date?: string) {
    return this.dashboardService.getDashboardData(user, date);
  }
}
