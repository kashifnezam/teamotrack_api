import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';

import type { Response } from 'express';

import { SalaryStructureService } from './salary-structure.service';
import { SalaryStructureDto } from './dto/salary-structure.dto';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RoleGuard } from 'src/auth/role.guard';
import { AllowRoles } from 'src/auth/roles.decorator';

@Controller('salary-structures')
export class SalaryStructureController {
  constructor(private readonly service: SalaryStructureService) {}

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
  create(@CurrentUser() user: any, @Body() dto: SalaryStructureDto) {
    return this.service.create(user.uid, dto);
  }

  // ==================================================
  // UPDATE
  // ==================================================
  @UseGuards(FirebaseAuthGuard, RoleGuard)
  @AllowRoles('root_manager')
  @Patch(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: SalaryStructureDto) {
    return this.service.update(user.uid, id, dto);
  }

  // ==================================================
  // DEACTIVATE
  // ==================================================
  @UseGuards(FirebaseAuthGuard, RoleGuard)
  @AllowRoles('root_manager')
  @Patch(':id/deactivate')
  deactivate(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deactivate(user.uid, id);
  }

  // ==================================================
  // REACTIVATE
  // ==================================================
  @UseGuards(FirebaseAuthGuard, RoleGuard)
  @AllowRoles('root_manager')
  @Patch(':id/reactivate')
  reactivate(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.reactivate(user.uid, id);
  }
}
