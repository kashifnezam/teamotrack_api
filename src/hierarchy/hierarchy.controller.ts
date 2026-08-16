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

import { HierarchyService } from './hierarchy.service';
import { HierarchyDto } from './dto/hierarchy.dto';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';


@Controller('hierarchy')
export class HierarchyController {

    constructor(
        private readonly service: HierarchyService,
    ) {}


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
                root: './public/dashboard',
            },
        );

    }


    // ==================================================
    // DATA
    // ==================================================

    @Get('data')
    @UseGuards(FirebaseAuthGuard)
    getData(
        @CurrentUser() user: any,
    ) {

        return this.service.getData(
            user.uid,
        );

    }


    // ==================================================
    // CREATE
    // ==================================================

    @Post()
    @UseGuards(FirebaseAuthGuard)
    create(
        @CurrentUser() user: any,
        @Body() dto: HierarchyDto,
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
    @UseGuards(FirebaseAuthGuard)
    update(
        @CurrentUser() user: any,
        @Param('id') id: string,
        @Body() dto: HierarchyDto,
    ) {

        return this.service.update(
            user.uid,
            id,
            dto,
        );

    }

}