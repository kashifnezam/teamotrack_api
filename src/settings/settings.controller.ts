import {
    Body,
    Controller,
    Get,
    Patch,
    Res,
    UseGuards,
} from '@nestjs/common';

import type { Response } from 'express';

import { SettingsService } from './settings.service';
import { SettingsDto } from './dto/settings.dto';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';


@Controller('settings')
export class SettingsController {

    constructor(
        private readonly service: SettingsService,
    ) {}


    // SPA shell
    // SPA shell
    @Get([
        '',
        'company',
        'users',
        'roles',
        'preferences',
    ])
    page(
        @Res() res: Response,
    ) {

        return res.sendFile(
            'shell.html',
            {
                root: './public/dashboard',
            },
        );

    }

    // Settings data
    @Get('data')
    @UseGuards(FirebaseAuthGuard)
    getData(
        @CurrentUser() user: any,
    ) {

        return this.service.getData(
            user.uid,
        );

    }


    // Update profile
    @Patch('profile')
    @UseGuards(FirebaseAuthGuard)
    updateProfile(
        @CurrentUser() user: any,
        @Body() dto: SettingsDto,
    ) {

        return this.service.updateProfile(
            user.uid,
            dto,
        );

    }


    // Update company
    @Patch('company')
    @UseGuards(FirebaseAuthGuard)
    updateCompany(
        @CurrentUser() user: any,
        @Body() dto: SettingsDto,
    ) {

        return this.service.updateCompany(
            user.uid,
            dto,
        );

    }


    // Update permissions
    @Patch('permissions')
    @UseGuards(FirebaseAuthGuard)
    updatePermissions(
        @CurrentUser() user: any,
        @Body() dto: SettingsDto,
    ) {

        return this.service.updatePermissions(
            user.uid,
            dto,
        );

    }

}