import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';

import type { Response } from 'express';

import { AttendanceService } from './attendance.service';

import { AttendanceDto } from './dto/attendance.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { ProcessAttendanceDto } from './dto/process-attendance.dto';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RootManagerGuard } from 'src/auth/root-manager.guard';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

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
  // MANUAL PROCESSOR
  // ============================================================

  @Post('process')
  @UseGuards(FirebaseAuthGuard, RootManagerGuard)
  async processAttendance(@CurrentUser() user: any, @Body() dto: ProcessAttendanceDto) {
    const authority = await this.service.assertCanProcess(user.uid);

    return this.service.processAttendanceForDate(dto.date, {
      mode: 'manual',
      triggeredBy: user.uid,
      rootId: authority.rootId,
    });
  }
}
