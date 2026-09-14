import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

import { AttendanceRegularizationService } from './attendance-regularization.service';

import { CreateAttendanceRegularizationDto } from './dto/create-attendance-regularization.dto';

import { ReviewAttendanceRegularizationDto } from './dto/review-attendance-regularization.dto';

import { RejectAttendanceRegularizationDto } from './dto/reject-attendance-regularization.dto';

import { RoleGuard } from 'src/auth/role.guard';

@Controller('attendance-regularization')
@UseGuards(FirebaseAuthGuard, RoleGuard)
export class AttendanceRegularizationController {
  constructor(private readonly service: AttendanceRegularizationService) {}

  // ============================================================
  // CREATE
  // ============================================================

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateAttendanceRegularizationDto) {
    return this.service.create(user.uid, dto);
  }

  // ============================================================
  // MY REQUESTS
  // ============================================================

  @Get('my')
  getMyRequests(@CurrentUser() user: any, @Query('month') month?: string, @Query('year') year?: string) {
    return this.service.getMyRequests(user.uid, month ? Number(month) : undefined, year ? Number(year) : undefined);
  }

  // ============================================================
  // PENDING APPROVALS
  // ============================================================

  @Get('approvals')
  getApprovals(@CurrentUser() user: any) {
    return this.service.getApprovals(user.uid);
  }

  // ============================================================
  // PROCESSING HISTORY
  // ============================================================

  @Get('history')
  getHistory(
    @CurrentUser() user: any,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('status') status?: string
  ) {
    return this.service.getHistory(
      user.uid,
      month ? Number(month) : undefined,
      year ? Number(year) : undefined,
      status
    );
  }

  // ============================================================
  // REQUEST DETAIL
  // ============================================================

  @Get(':id')
  getById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getById(user.uid, id);
  }

  // ============================================================
  // REGULARIZE
  // ============================================================

  @Post(':id/regularize')
  regularize(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: ReviewAttendanceRegularizationDto) {
    return this.service.regularize(user.uid, id, dto.attendanceStatus);
  }

  // ============================================================
  // REJECT
  // ============================================================

  @Post(':id/reject')
  reject(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RejectAttendanceRegularizationDto) {
    return this.service.reject(user.uid, id, dto.reason);
  }

  // ============================================================
  // CANCEL
  // ============================================================

  @Post(':id/cancel')
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancel(user.uid, id);
  }
}
