import { Module } from '@nestjs/common';
import { GoogleCalendarService } from './calendar.service';

@Module({
  providers: [GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class CalendarModule {}
