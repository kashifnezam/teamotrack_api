import {
    Controller,
    Get,
    Res,
    UseGuards,
} from '@nestjs/common';

import type { Response } from 'express';

import { DashboardService } from './dashboard.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('dashboard')
export class DashboardController {

    constructor(
        private readonly dashboardService: DashboardService,
    ) {}

    // Dashboard SPA shell
    @Get()
    page(@Res() res: Response) {

        return res.sendFile(
            'shell.html',
            {
                root: './public/dashboard',
            },
        );
    }

    // Dashboard API
    @Get('me')
    @UseGuards(FirebaseAuthGuard)
    me(
        @CurrentUser() user: any,
    ) {

        return this.dashboardService.getDashboardData(
            user,
        );
    }
}