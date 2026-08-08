import {
  Controller,
  Get,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { DashboardService } from './dashboard.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
  ) {}

  // Loads dashboard.html
  @Get()
  dashboard(@Res() res: Response) {
    return res.sendFile(
      'dashboard.html',
      {
        root: './public/dashboard/pages',
      },
    );
  }

  // Protected dashboard API
  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  me(@CurrentUser() user: any) {
    return this.dashboardService.getDashboardData(user);
  }
}