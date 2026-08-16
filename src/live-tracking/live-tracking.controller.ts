import {
    Body,
    Controller,
    Get,
    Post,
    Res,
    UseGuards,
} from '@nestjs/common';

import type { Response } from 'express';

import { LiveTrackingService } from './live-tracking.service';
import { LiveTrackingDto } from './dto/live-tracking.dto';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('attendance/live')
export class LiveTrackingController {

    constructor(
        private readonly service: LiveTrackingService,
    ) {}


    // SPA shell
    @Get()
    page(@Res() res: Response) {

        return res.sendFile(
            'shell.html',
            {
                root: './public/dashboard',
            },
        );

    }


    // Tracking history
    @Post('history')
    @UseGuards(FirebaseAuthGuard)
    history(
        @CurrentUser() user: any,
        @Body() dto: LiveTrackingDto,
    ) {

        return this.service.getHistory(
            user.uid,
            dto,
        );

    }


    // Current live employees
    @Get('data')
    @UseGuards(FirebaseAuthGuard)
    live(
        @CurrentUser() user: any,
    ) {

        return this.service.getLive(
            user.uid,
        );

    }

}