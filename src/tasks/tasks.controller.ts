import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Res,
    UseGuards,
} from '@nestjs/common';

import type { Response } from 'express';

import { TasksService } from './tasks.service';
import { TaskDto } from './dto/task.dto';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('tasks')
export class TasksController {

    constructor(
        private readonly service: TasksService,
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


    // Monthly tasks API
    @Get('data')
    @UseGuards(FirebaseAuthGuard)
    get(
        @CurrentUser() user: any,
        @Query('year') year?: string,
        @Query('month') month?: string,
    ) {

        const now = new Date();

        return this.service.getAll(
            user.uid,
            Number(year) || now.getFullYear(),
            Number(month) || now.getMonth() + 1,
        );
    }


    // Create
    @Post()
    @UseGuards(FirebaseAuthGuard)
    create(
        @CurrentUser() user: any,
        @Body() dto: TaskDto,
    ) {

        return this.service.create(
            user.uid,
            dto,
        );
    }


    // Update
    @Patch(':id')
    @UseGuards(FirebaseAuthGuard)
    update(
        @CurrentUser() user: any,
        @Param('id') id: string,
        @Body() dto: Partial<TaskDto>,
    ) {

        return this.service.update(
            user.uid,
            id,
            dto,
        );
    }


    // Delete
    @Delete(':id')
    @UseGuards(FirebaseAuthGuard)
    remove(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {

        return this.service.remove(
            user.uid,
            id,
        );
    }


    // Status
    @Patch(':id/status')
    @UseGuards(FirebaseAuthGuard)
    status(
        @CurrentUser() user: any,
        @Param('id') id: string,
        @Body('status') status: string,
    ) {

        return this.service.updateStatus(
            user.uid,
            id,
            status,
        );
    }
}