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

    // Static page
    @Get()
    page(@Res() res: Response) {
        return res.sendFile(
            'tasks.html',
            {
                root: './public/dashboard/pages/task',
            },
        );
    }

    // Month data
    @Get('data')
    @UseGuards(FirebaseAuthGuard)
    get(
        @CurrentUser() user: any,
        @Query('year') year?: string,
        @Query('month') month?: string,
        @Query('status') status?: string,
    ) {
        const now = new Date();

        return this.service.getAll(
            user.uid,
            Number(year) || now.getFullYear(),
            Number(month) || now.getMonth() + 1,
            status,
        );
    }

    @Post()
    @UseGuards(FirebaseAuthGuard)
    create(
        @CurrentUser() user: any,
        @Body() dto: TaskDto,
    ) {
        return this.service.create(user.uid, dto);
    }

    @Patch(':id')
    @UseGuards(FirebaseAuthGuard)
    update(
        @CurrentUser() user: any,
        @Param('id') id: string,
        @Body() dto: Partial<TaskDto>,
    ) {
        return this.service.update(user.uid, id, dto);
    }

    @Delete(':id')
    @UseGuards(FirebaseAuthGuard)
    remove(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {
        return this.service.remove(user.uid, id);
    }

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