import { Body, Controller, Get, Param, Patch, Res, UseGuards } from '@nestjs/common';

import type { Response } from 'express';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PayslipService } from './payslip.service';
import { RootManagerGuard } from 'src/auth/root-manager.guard';

@Controller('payslips')
export class PayslipController {
  constructor(private readonly service: PayslipService) {}

  // ==================================================
  // SPA SHELL
  // ==================================================

  @Get()
  page(@Res() res: Response) {
    return res.sendFile('shell.html', {
      root: './public/dashboard',
    });
  }

  // ==================================================
  // DATA
  // ==================================================

  @UseGuards(FirebaseAuthGuard, RootManagerGuard)
  @Get('data')
  getAll(@CurrentUser() user: any) {
    return this.service.getAll(user.uid);
  }

  // ==================================================
  // TEMPLATE SETTINGS
  // ==================================================

  @UseGuards(FirebaseAuthGuard, RootManagerGuard)
  @Get('template/settings')
  getTemplateSettings(@CurrentUser() user: any) {
    return this.service.getTemplateSettings(user.uid);
  }

  @UseGuards(FirebaseAuthGuard, RootManagerGuard)
  @Patch('template')
  setTemplate(@CurrentUser() user: any, @Body('template') template: string) {
    return this.service.setTemplate(user.uid, template);
  }

  // ==================================================
  // PERIOD
  // ==================================================

  @UseGuards(FirebaseAuthGuard, RootManagerGuard)
  @Get('period/:periodId')
  getPeriod(@CurrentUser() user: any, @Param('periodId') periodId: string) {
    return this.service.getPeriod(user.uid, periodId);
  }

  // ==================================================
  // SINGLE PAYSLIP
  // ==================================================

  @UseGuards(FirebaseAuthGuard, RootManagerGuard)
  @Get(':paymentId')
  get(@CurrentUser() user: any, @Param('paymentId') paymentId: string) {
    return this.service.get(user.uid, paymentId);
  }
}
