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

import { SalaryStructureService } from './salary-structure.service';
import { SalaryStructureDto } from './dto/salary-structure.dto';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RootManagerGuard } from 'src/auth/root-manager.guard';

@Controller('salary-structures')
@UseGuards(
    FirebaseAuthGuard,
    RootManagerGuard,
)
export class SalaryStructureController {

    constructor(
        private readonly service:
            SalaryStructureService,
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
        @Body() dto: SalaryStructureDto,
    ) {

        return this.service.create(
            user.uid,
            dto,
        );

    }


    // ==================================================
    // UPDATE
    // ==================================================

    @Patch(':id')
    update(
        @CurrentUser() user: any,
        @Param('id') id: string,
        @Body() dto: SalaryStructureDto,
    ) {

        return this.service.update(
            user.uid,
            id,
            dto,
        );

    }


    // ==================================================
    // DEACTIVATE
    // ==================================================

    @Patch(':id/deactivate')
    deactivate(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {

        return this.service.deactivate(
            user.uid,
            id,
        );

    }


    // ==================================================
    // REACTIVATE
    // ==================================================

    @Patch(':id/reactivate')
    reactivate(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {

        return this.service.reactivate(
            user.uid,
            id,
        );

    }

}