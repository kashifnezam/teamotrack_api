import { Injectable, Logger } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { AttendanceSchedulerService } from './scheduler.service';

@Injectable()
export class AttendanceScheduler {
  private readonly logger = new Logger(AttendanceScheduler.name);

  constructor(private readonly schedulerService: AttendanceSchedulerService) {}

  /*
   * 00:30 Asia/Kolkata every day.
   *
   * This processes yesterday.
   */
  @Cron('0 30 0 * * *', {
    name: 'attendance-daily-processing',

    timeZone: 'Asia/Kolkata',

    waitForCompletion: true,
  })
  async processYesterday() {
    const date = this.getYesterdayIndia();

    this.logger.log(`Starting automatic attendance processing | date=${date}`);

    try {
      const result = await this.schedulerService.processAttendanceForDate(date, {
        mode: 'scheduled',

        triggeredBy: 'scheduler',
      });

      this.logger.log(
        `Attendance processing completed | date=${date} | staff=${result.staffProcessed} | created=${result.recordsCreated} | updated=${result.recordsUpdated} | skipped=${result.recordsSkipped} | errors=${result.errors}`
      );
    } catch (error) {
      this.logger.error(
        `Automatic attendance processing failed | date=${date}`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  private getYesterdayIndia(): string {
    const now = new Date();

    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    });

    /*
     * Convert the current India date into
     * a stable YYYY-MM-DD string first.
     */
    const today = formatter.format(now);

    /*
     * Use UTC arithmetic here so the date
     * calculation is not affected by the
     * server's local timezone.
     */
    const [year, month, day] = today.split('-').map(Number);

    const yesterday = new Date(Date.UTC(year, month - 1, day - 1));

    return formatter.format(yesterday);
  }
}
