import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';

import type { Response } from 'express';

import { PayrollPeriodService } from './payroll-period.service';
import { PayrollPeriodDto } from './dto/payroll-period.dto';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AllowRoles } from 'src/auth/roles.decorator';
import { RoleGuard } from 'src/auth/role.guard';

@Controller('payroll-periods')
export class PayrollPeriodController {
  constructor(private readonly service: PayrollPeriodService) {}

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
  @Get('data')
  get(@CurrentUser() user: any) {
    return this.service.getAll(user.uid);
  }

  // ==================================================
  // CREATE
  // ==================================================
  @UseGuards(FirebaseAuthGuard, RoleGuard)
  @AllowRoles('root_manager')
  @Post()
  create(@CurrentUser() user: any, @Body() dto: PayrollPeriodDto) {
    return this.service.create(user.uid, dto);
  }

  // ==================================================
  // PROCESSING
  // ==================================================
  @UseGuards(FirebaseAuthGuard, RoleGuard)
  @AllowRoles('root_manager')
  @Patch(':id/processing')
  processing(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.processing(user.uid, id);
  }

  // ==================================================
  // PROCESSED
  // ==================================================
  @UseGuards(FirebaseAuthGuard, RoleGuard)
  @AllowRoles('root_manager')
  @Patch(':id/processed')
  processed(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.processed(user.uid, id);
  }

  // ==================================================
  // CLOSED
  // ==================================================
  @UseGuards(FirebaseAuthGuard, RoleGuard)
  @AllowRoles('root_manager')
  @Patch(':id/closed')
  closed(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.closed(user.uid, id);
  }

  // ==================================================
  // REOPEN
  // ==================================================
  @UseGuards(FirebaseAuthGuard, RoleGuard)
  @AllowRoles('root_manager')
  @Patch(':id/reopen')
  reopen(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.reopen(user.uid, id);
  }
}
