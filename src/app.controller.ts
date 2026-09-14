import { Controller, Get, Res } from '@nestjs/common';

import type { Response } from 'express';
import { FRONTEND_SHELL_ROUTES } from './config/frontend-routes';

@Controller()
export class AppController {
  @Get()
  home(@Res() res: Response) {
    return res.redirect('/dashboard');
  }

  // ==========================================================
  // SPA SHELL
  // ==========================================================

  @Get(FRONTEND_SHELL_ROUTES)
  page(@Res() res: Response) {
    return res.sendFile('shell.html', {
      root: './public/dashboard',
    });
  }
}
