import { Body, Controller, Delete, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';

import type { Response } from 'express';

import { LeaveService } from './leave.service';

import { LeaveDto, LeaveTypeDto } from './dto/leave.dto';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('leave')
export class LeaveController {
  constructor(private readonly service: LeaveService) {}

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
  // LEAVE REQUESTS
  // ==================================================

  @Get('data')
  @UseGuards(FirebaseAuthGuard)
  get(@CurrentUser() user: any) {
    return this.service.getAll(user.uid);
  }

  @Get('team')
  @UseGuards(FirebaseAuthGuard)
  getTeamLeaves(@CurrentUser() user: any) {
    return this.service.getTeamLeaves(user.uid);
  }

  // ==================================================
  // PENDING APPROVALS
  // ==================================================

  @Get('approvals')
  @UseGuards(FirebaseAuthGuard)
  getApprovals(@CurrentUser() user: any) {
    return this.service.getApprovals(user.uid);
  }

  // ==================================================
  // CREATE LEAVE
  // ==================================================

  @Post()
  @UseGuards(FirebaseAuthGuard)
  create(@CurrentUser() user: any, @Body() dto: LeaveDto) {
    return this.service.create(user.uid, dto);
  }

  // ==================================================
  // UPDATE LEAVE
  // ==================================================

  @Patch(':id')
  @UseGuards(FirebaseAuthGuard)
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: LeaveDto) {
    return this.service.update(user.uid, id, dto);
  }

  // ==================================================
  // CANCEL / DELETE LEAVE
  // ==================================================

  @Delete(':id')
  @UseGuards(FirebaseAuthGuard)
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.remove(user.uid, id);
  }

  // ==================================================
  // APPROVE LEAVE
  // ==================================================

  @Patch(':id/approve')
  @UseGuards(FirebaseAuthGuard)
  approve(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.approve(user.uid, id);
  }

  // ==================================================
  // REJECT LEAVE
  // ==================================================

  @Patch(':id/reject')
  @UseGuards(FirebaseAuthGuard)
  reject(@CurrentUser() user: any, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.service.reject(user.uid, id, reason);
  }

  // ==================================================
  // LEAVE TYPE ACCESS
  // ==================================================

  @Get('types/access')
  @UseGuards(FirebaseAuthGuard)
  getTypeAccess(@CurrentUser() user: any) {
    return this.service.getTypeAccess(user.uid);
  }

  // ==================================================
  // MANAGEABLE LEAVE TYPES
  // ==================================================

  @Get('types/manage')
  @UseGuards(FirebaseAuthGuard)
  getManageableTypes(@CurrentUser() user: any) {
    return this.service.getManageableTypes(user.uid);
  }

  // ==================================================
  // ACTIVE LEAVE TYPES
  // ==================================================

  @Get('types')
  @UseGuards(FirebaseAuthGuard)
  getTypes(@CurrentUser() user: any) {
    return this.service.getTypes(user.uid);
  }

  // ==================================================
  // CREATE LEAVE TYPE
  // ==================================================

  @Post('types')
  @UseGuards(FirebaseAuthGuard)
  createType(@CurrentUser() user: any, @Body() dto: LeaveTypeDto) {
    return this.service.createType(user.uid, dto);
  }

  // ==================================================
  // DEACTIVATE LEAVE TYPE
  // ==================================================

  @Patch('types/:id/deactivate')
  @UseGuards(FirebaseAuthGuard)
  deactivateType(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deactivateType(user.uid, id);
  }

  // ==================================================
  // REACTIVATE LEAVE TYPE
  // ==================================================

  @Patch('types/:id/reactivate')
  @UseGuards(FirebaseAuthGuard)
  reactivateType(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.reactivateType(user.uid, id);
  }
}
