import { Body, Controller, Get, Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';

import type { Response } from 'express';

import { FileInterceptor } from '@nestjs/platform-express';

import { SettingsService } from './settings.service';
import { SettingsDto } from './dto/settings.dto';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChangeEmailDto } from './dto/change.email.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  // ==================================================
  // SPA SHELL
  // ==================================================

  @Get(['', 'company', 'users', 'roles', 'preferences'])
  page(@Res() res: Response) {
    return res.sendFile('shell.html', {
      root: './public/dashboard',
    });
  }

  // ==================================================
  // SETTINGS DATA
  // ==================================================

  @Get('organization')
  @UseGuards(FirebaseAuthGuard)
  getOrganizationData(@CurrentUser() user: any) {
    return this.service.getOrganizationData(user.uid);
  }

  @Get('profile')
  @UseGuards(FirebaseAuthGuard)
  getProfileData(@CurrentUser() user: any) {
    return this.service.getProfileData(user.uid);
  }

  // ==================================================
  // UPDATE PROFILE
  // ==================================================

  @Patch('profile')
  @UseGuards(FirebaseAuthGuard)
  updateProfile(@CurrentUser() user: any, @Body() dto: SettingsDto) {
    return this.service.updateProfile(user.uid, dto);
  }

  @Patch('profile/email')
  @UseGuards(FirebaseAuthGuard)
  changeEmail(@CurrentUser() user: any, @Body() dto: ChangeEmailDto) {
    return this.service.changeEmail(user.uid, dto);
  }

  // ==================================================
  // UPDATE ORGANIZATION
  // ==================================================

  @Patch('company')
  @UseGuards(FirebaseAuthGuard)
  updateCompany(@CurrentUser() user: any, @Body() dto: SettingsDto) {
    return this.service.updateCompany(user.uid, dto);
  }

  // ==================================================
  // ORGANIZATION LOGO
  // ==================================================

  @Post('company/logo')
  @UseGuards(FirebaseAuthGuard)
  @UseInterceptors(FileInterceptor('logo'))
  uploadLogo(@CurrentUser() user: any, @UploadedFile() file: any) {
    return this.service.uploadLogo(user.uid, file);
  }
}
