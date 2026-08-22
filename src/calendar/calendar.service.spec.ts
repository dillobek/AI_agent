import { ModuleDisabledException } from '../common/exceptions/module-disabled.exception';
import { GoogleCalendarService } from './calendar.service';

function makeService(enabled: boolean) {
  const config = { moduleFlags: { calendar: enabled }, get: jest.fn().mockReturnValue('fake') } as any;
  return new GoogleCalendarService(config);
}

describe('GoogleCalendarService', () => {
  it('fails closed when CALENDAR_ENABLED is false, before touching the network', async () => {
    const service = makeService(false);
    await expect(service.listEventsForRange(new Date(), new Date())).rejects.toBeInstanceOf(ModuleDisabledException);
  });
});
