import { ModuleDisabledException } from '../common/exceptions/module-disabled.exception';
import { YoutubeService } from './youtube.service';

function makeService(enabled: boolean) {
  const config = { moduleFlags: { youtube: enabled }, get: jest.fn().mockReturnValue('fake-key') } as any;
  return new YoutubeService(config);
}

describe('YoutubeService', () => {
  it('fails closed when YOUTUBE_ENABLED is false, before touching the network', async () => {
    const service = makeService(false);
    await expect(service.searchVideo('anything')).rejects.toBeInstanceOf(ModuleDisabledException);
  });
});
