import { Body, Controller, Get, Param, Res, Post, Query, UseGuards } from '@nestjs/common';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

import { AttendanceRegularizationService } from './attendance-regularization.service';

import { CreateAttendanceRegularizationDto } from './dto/create-attendance-regularization.dto';
import { RejectAttendanceRegularizationDto } from './dto/reject-attendance-regularization.dto';
import type { Response } from 'express';

@Controller('attendance-regularization')
export class AttendanceRegularizationController {
  constructor(private readonly service: AttendanceRegularizationService) {}

  // ============================================================
  // SPA
  // ============================================================

  @Get()
  page(@Res() res: Response) {
    return res.sendFile('shell.html', {
      root: './public/dashboard',
    });
  }
  // ============================================================
  // CREATE
  // ============================================================

  @Post()
  @UseGuards(FirebaseAuthGuard)
  create(@CurrentUser() user: any, @Body() dto: CreateAttendanceRegularizationDto) {
    return this.service.create(user.uid, dto);
  }

  // ============================================================
  // MY REQUESTS
  // ============================================================

  @Get('my')
  @UseGuards(FirebaseAuthGuard)
  getMyRequests(@CurrentUser() user: any, @Query('month') month?: string, @Query('year') year?: string) {
    return this.service.getMyRequests(user.uid, month ? Number(month) : undefined, year ? Number(year) : undefined);
  }

  // ============================================================
  // APPROVALS
  // ============================================================

  @Get('approvals')
  @UseGuards(FirebaseAuthGuard)
  getApprovals(@CurrentUser() user: any) {
    return this.service.getApprovals(user.uid);
  }

  // ============================================================
  // REQUEST DETAIL
  // ============================================================

  @Get(':id')
  @UseGuards(FirebaseAuthGuard)
  getById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getById(user.uid, id);
  }

  // ============================================================
  // APPROVE
  // ============================================================

  @Post(':id/approve')
  @UseGuards(FirebaseAuthGuard)
  approve(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.approve(user.uid, id);
  }

  // ============================================================
  // REJECT
  // ============================================================

  @Post(':id/reject')
  @UseGuards(FirebaseAuthGuard)
  reject(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RejectAttendanceRegularizationDto) {
    return this.service.reject(user.uid, id, dto.reason);
  }

  // ============================================================
  // CANCEL
  // ============================================================

  @Post(':id/cancel')
  @UseGuards(FirebaseAuthGuard)
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancel(user.uid, id);
  }
}
