import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';

import type { Response } from 'express';

import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollCalculationDto } from './dto/payroll-calculation.dto';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AllowRoles } from 'src/auth/roles.decorator';
import { RoleGuard } from 'src/auth/role.guard';

@Controller('payroll-calculations')
export class PayrollCalculationController {
  constructor(private readonly service: PayrollCalculationService) {}

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
  // GET DATA
  // ==================================================

  @UseGuards(FirebaseAuthGuard, RoleGuard)
  @AllowRoles('root_manager')
  @Get('data/:periodId')
  get(@CurrentUser() user: any, @Param('periodId') periodId: string) {
    return this.service.getAll(user.uid, periodId);
  }

  // ==================================================
  // CALCULATE
  // ==================================================

  @UseGuards(FirebaseAuthGuard, RoleGuard)
  @AllowRoles('root_manager')
  @Post()
  calculate(@CurrentUser() user: any, @Body() dto: PayrollCalculationDto) {
    return this.service.calculate(user.uid, dto.payrollPeriodId);
  }
}
