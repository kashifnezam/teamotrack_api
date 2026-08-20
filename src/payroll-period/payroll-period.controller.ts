import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Res,
    UseGuards,
} from '@nestjs/common';

import type { Response } from 'express';

import { PayrollPeriodService } from './payroll-period.service';
import { PayrollPeriodDto } from './dto/payroll-period.dto';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RootManagerGuard } from 'src/auth/root-manager.guard';

@Controller('payroll-periods')
@UseGuards(
    FirebaseAuthGuard,
    RootManagerGuard,
)
export class PayrollPeriodController {

    constructor(
        private readonly service:
            PayrollPeriodService,
    ) { }


    // ==================================================
    // SPA SHELL
    // ==================================================

    @Get()
    page(
        @Res() res: Response,
    ) {

        return res.sendFile(
            'shell.html',
            {
                root:
                    './public/dashboard',
            },
        );

    }


    // ==================================================
    // GET DATA
    // ==================================================

    @Get('data')
    get(
        @CurrentUser() user: any,
    ) {

        return this.service.getAll(
            user.uid,
        );

    }


    // ==================================================
    // CREATE
    // ==================================================

    @Post()
    create(
        @CurrentUser() user: any,
        @Body() dto: PayrollPeriodDto,
    ) {

        return this.service.create(
            user.uid,
            dto,
        );

    }


    // ==================================================
    // PROCESSING
    // ==================================================

    @Patch(':id/processing')
    processing(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {

        return this.service.processing(
            user.uid,
            id,
        );

    }


    // ==================================================
    // PROCESSED
    // ==================================================

    @Patch(':id/processed')
    processed(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {

        return this.service.processed(
            user.uid,
            id,
        );

    }


    // ==================================================
    // CLOSED
    // ==================================================

    @Patch(':id/closed')
    closed(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {

        return this.service.closed(
            user.uid,
            id,
        );

    }


    // ==================================================
    // REOPEN
    // ==================================================

    @Patch(':id/reopen')
    reopen(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {

        return this.service.reopen(
            user.uid,
            id,
        );

    }

}