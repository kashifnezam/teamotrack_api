import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';

import type { Response } from 'express';

import { DashboardService } from './dashboard.service';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

import { CurrentUser } from '../auth/current-user.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // ==========================================================
  // DASHBOARD SPA
  // ==========================================================

  @Get()
  page(@Res() res: Response) {
    return res.sendFile('shell.html', {
      root: './public/dashboard',
    });
  }

  // ==========================================================
  // DASHBOARD DATA
  // ==========================================================

  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  async me(
    @CurrentUser() user: any,

    @Query('date') date?: string
  ) {
    return this.dashboardService.getDashboardData(user, date);
  }
}
