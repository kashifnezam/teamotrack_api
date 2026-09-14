import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';

import type { Response } from 'express';

import { PaymentService } from './payment.service';
import { PaymentDto } from './dto/payment.dto';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AllowRoles } from 'src/auth/roles.decorator';
import { RoleGuard } from 'src/auth/role.guard';

@Controller('payments')
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

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
  // GET PAYMENTS
  // ==================================================

  @UseGuards(FirebaseAuthGuard, RoleGuard)
  @AllowRoles('root_manager')
  @Get('data')
  @UseGuards(FirebaseAuthGuard)
  get(@CurrentUser() user: any) {
    return this.service.getAll(user.uid);
  }

  // ==================================================
  // GET PAYROLL PERIOD PAYMENTS
  // ==================================================

  @UseGuards(FirebaseAuthGuard, RoleGuard)
  @AllowRoles('root_manager')
  @Get('period/:periodId')
  @UseGuards(FirebaseAuthGuard)
  getPeriod(@CurrentUser() user: any, @Param('periodId') periodId: string) {
    return this.service.getPeriod(user.uid, periodId);
  }

  // ==================================================
  // CREATE PAYMENT
  // ==================================================

  @UseGuards(FirebaseAuthGuard, RoleGuard)
  @AllowRoles('root_manager')
  @Post()
  @UseGuards(FirebaseAuthGuard)
  create(@CurrentUser() user: any, @Body() dto: PaymentDto) {
    return this.service.create(user.uid, dto);
  }

  // ==================================================
  // CANCEL PAYMENT
  // ==================================================

  @UseGuards(FirebaseAuthGuard, RoleGuard)
  @AllowRoles('root_manager')
  @Patch(':id/cancel')
  @UseGuards(FirebaseAuthGuard)
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancel(user.uid, id);
  }

  @UseGuards(FirebaseAuthGuard, RoleGuard)
  @AllowRoles('root_manager')
  @Get('payable/:periodId')
  @UseGuards(FirebaseAuthGuard)
  getPayable(@CurrentUser() user: any, @Param('periodId') periodId: string) {
    return this.service.getPayable(user.uid, periodId);
  }
}
