import { Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';

import type { Response } from 'express';

import { NotificationsService } from './notifications.service';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

import { CurrentUser } from '../auth/current-user.decorator';

import { NotificationQueryDto } from './dto/notification.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

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
  // API
  // ==================================================

  @Get('data')
  @UseGuards(FirebaseAuthGuard)
  get(@CurrentUser() user: any, @Query() dto: NotificationQueryDto) {
    return this.service.getAll(user.uid, dto);
  }

  // ==================================================
  // MARK ONE AS READ
  // ==================================================

  @Patch(':id/read')
  @UseGuards(FirebaseAuthGuard)
  markAsRead(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.markAsRead(user.uid, id);
  }

  // ==================================================
  // MARK ALL AS READ
  // ==================================================

  @Post('read-all')
  @UseGuards(FirebaseAuthGuard)
  markAllAsRead(@CurrentUser() user: any) {
    return this.service.markAllAsRead(user.uid);
  }
}
