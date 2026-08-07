import { Controller, Get, Res } from '@nestjs/common';
import express from 'express';

@Controller()
export class AppController {
  @Get()
  home(@Res() res: express.Response) {
    return res.redirect('/login');
  }
}