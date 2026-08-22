import { PlanService } from './plan.service';

function makeService(flags: Record<string, boolean>, overrides: { calendar?: any; obsidian?: any } = {}) {
  const prisma = {
    planItem: {
      create: jest.fn(async ({ data }: any) => ({ id: 'p1', status: 'PENDING', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as any;
  const config = { moduleFlags: flags, get: jest.fn().mockReturnValue('{date}.md') } as any;
  const n8n = { notifyEvent: jest.fn().mockResolvedValue(undefined) } as any;
  const calendar = overrides.calendar ?? { listEventsForRange: jest.fn().mockResolvedValue([]) };
  const obsidian = overrides.obsidian ?? { fetchFileContent: jest.fn().mockRejectedValue(new Error('not found')) };
  return { service: new PlanService(prisma, config, n8n, calendar, obsidian), prisma, n8n, calendar, obsidian };
}

describe('PlanService', () => {
  it('creates a plan item and fires a best-effort n8n event', async () => {
    const { service, n8n } = makeService({});
    const item = await service.addPlanItem('Doktorga borish');
    expect(item.title).toBe('Doktorga borish');
    expect(n8n.notifyEvent).toHaveBeenCalledWith('plan.item_created', expect.objectContaining({ title: 'Doktorga borish' }));
  });

  it('renders plan items only when calendar/obsidian are disabled', async () => {
    const { service } = makeService({ calendar: false, obsidian: false });
    const text = await service.renderTodayPlan();
    expect(text).toContain('Plan items');
    expect(text).not.toContain('Calendar events');
    expect(text).not.toContain('Obsidian daily note');
  });

  it('includes calendar events when enabled and degrades quietly on calendar failure', async () => {
    const calendar = { listEventsForRange: jest.fn().mockRejectedValue(new Error('boom')) };
    const { service } = makeService({ calendar: true, obsidian: false }, { calendar });
    const text = await service.renderTodayPlan();
    expect(text).toContain('Calendar events: could not be loaded right now.');
  });

  it('silently omits the Obsidian section when there is no daily note for today', async () => {
    const { service } = makeService({ calendar: false, obsidian: true });
    const text = await service.renderTodayPlan();
    expect(text).not.toContain('Obsidian daily note');
  });

  it('includes the Obsidian daily note when one exists', async () => {
    const obsidian = { fetchFileContent: jest.fn().mockResolvedValue('- buy milk\n- call mom') };
    const { service } = makeService({ calendar: false, obsidian: true }, { obsidian });
    const text = await service.renderTodayPlan();
    expect(text).toContain('Obsidian daily note');
    expect(text).toContain('buy milk');
  });
});
