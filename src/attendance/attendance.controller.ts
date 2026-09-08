import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';

import type { Response } from 'express';

import { AttendanceService } from './attendance.service';
import { AttendanceSchedulerService } from './scheduler.service';

import { AttendanceDto } from './dto/attendance.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { ProcessAttendanceDto } from './dto/process-attendance.dto';
import { BreakDto } from './dto/break.dto';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RootManagerGuard } from '../auth/root-manager.guard';

@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly service: AttendanceService,
    private readonly schedulerService: AttendanceSchedulerService
  ) {}

  // ============================================================
  // SPA
  // ============================================================

  @Get()
  page(@Res() res: Response) {
    return res.sendFile('shell.html', {
      root: './public/dashboard',
    });
  }

  @Get('my')
  pageMe(@Res() res: Response) {
    return res.sendFile('shell.html', {
      root: './public/dashboard',
    });
  }

  // ============================================================
  // CHECK IN
  // ============================================================

  @Post('check-in')
  @UseGuards(FirebaseAuthGuard)
  checkIn(@CurrentUser() user: any, @Body() dto: CheckInDto) {
    return this.service.checkIn(user.uid, dto);
  }

  // ============================================================
  // CHECK OUT
  // ============================================================

  @Post('check-out')
  @UseGuards(FirebaseAuthGuard)
  checkOut(@CurrentUser() user: any, @Body() dto: CheckOutDto) {
    return this.service.checkOut(user.uid, dto);
  }

  // ============================================================
  // START BREAK
  // ============================================================

  @Post('start-break')
  @UseGuards(FirebaseAuthGuard)
  startBreak(@CurrentUser() user: any, @Body() dto: BreakDto) {
    return this.service.startBreak(user.uid, dto);
  }

  // ============================================================
  // END BREAK
  // ============================================================

  @Post('end-break')
  @UseGuards(FirebaseAuthGuard)
  endBreak(@CurrentUser() user: any, @Body() dto: BreakDto) {
    return this.service.endBreak(user.uid, dto);
  }

  // ============================================================
  // ATTENDANCE DATA
  // ============================================================

  @Post('data')
  @UseGuards(FirebaseAuthGuard)
  getData(@CurrentUser() user: any, @Body() dto: AttendanceDto) {
    return this.service.getData(user.uid, dto);
  }

  // ============================================================
  // MY ATTENDANCE
  // ============================================================

  @Get('my-data')
  @UseGuards(FirebaseAuthGuard)
  getMyData(@CurrentUser() user: any, @Query('month') month?: string, @Query('year') year?: string) {
    const now = new Date();

    const selectedMonth = month ? Number(month) : now.getMonth() + 1;

    const selectedYear = year ? Number(year) : now.getFullYear();

    return this.service.getMyData(user.uid, selectedMonth, selectedYear);
  }

  // ============================================================
  // MANUAL ATTENDANCE PROCESSOR
  // ============================================================

  @Post('process')
  @UseGuards(FirebaseAuthGuard, RootManagerGuard)
  async processAttendance(@CurrentUser() user: any, @Body() dto: ProcessAttendanceDto) {
    const authority = await this.schedulerService.assertCanProcess(user.uid);

    return this.schedulerService.processAttendanceForDate(dto.date, {
      mode: 'manual',
      triggeredBy: user.uid,
      rootId: authority.rootId,
    });
  }
}
