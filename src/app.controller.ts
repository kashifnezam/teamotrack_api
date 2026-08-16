import { Controller, Get, Res } from '@nestjs/common';
import express from 'express';
import type { Response } from 'express';

@Controller()
export class AppController {
  @Get()
  home(@Res() res: express.Response) {
    return res.redirect('/login');
  }

  // SPA shell
  @Get("profile")
  page(@Res() res: Response) {

    return res.sendFile(
      'shell.html',
      {
        root: './public/dashboard',
      },
    );
  }
}