import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { ErrorState, Loading } from '../components/StateViews';

type Channel = { channelId: string; title: string; policyFileName?: string | null };
type Post = { id: string; channelId: string; status: string; caption: string; createdAt: string };

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [channelResponse, postResponse] = await Promise.all([
        api.get<Channel[]>('/personal-automation/channels'),
        api.get<Post[]>('/personal-automation/channel-posts'),
      ]);
      setChannels(channelResponse.data);
      setPosts(postResponse.data);
      setSelectedChannel((current) => current || channelResponse.data[0]?.channelId || '');
    } catch {
      setError('Kanallar ma’lumotini yuklab bo‘lmadi. Admin login va API ulanishini tekshiring.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const addChannel = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post('/personal-automation/channels', { channelId, title });
      setChannelId('');
      setTitle('');
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Kanal qo‘shilmadi. Kanal ID va admin huquqlarini tekshiring.');
    } finally { setBusy(false); }
  };

  const uploadPolicy = async (file: File) => {
    if (!selectedChannel) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post(`/personal-automation/channels/${encodeURIComponent(selectedChannel)}/policy`, form);
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Markdown qoida fayli yuklanmadi.');
    } finally { setBusy(false); }
  };

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post('/personal-automation/channel-posts/publish', { channelId: selectedChannel, topic });
      setTopic('');
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Post yuborilmadi. Image worker va Telegram connector holatini tekshiring.');
    } finally { setBusy(false); }
  };

  if (loading) return <Loading label="Kanallar yuklanmoqda…" />;
  if (error && channels.length === 0) return <ErrorState message={error} onRetry={load} />;

  return (
    <div style={{ maxWidth: 900 }}>
      <h2>Kanallar va kontent qoidalari</h2>
      <p style={{ color: '#666' }}>Kanal qo‘shing, unga Markdown qoida faylini ulang va mavzu orqali rasmli post yarating.</p>
      {error ? <p style={{ color: '#b71c1c' }}>{error}</p> : null}

      <form onSubmit={addChannel} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kanal nomi" required maxLength={120} />
        <input value={channelId} onChange={(e) => setChannelId(e.target.value)} placeholder="@kanal_yoki_ID" required maxLength={160} />
        <button disabled={busy}>Kanal qo‘shish</button>
      </form>

      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 18 }}>
        <label>
          Kanal: {' '}
          <select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)} disabled={busy}>
            <option value="">Tanlang</option>
            {channels.map((channel) => <option key={channel.channelId} value={channel.channelId}>{channel.title} ({channel.channelId})</option>)}
          </select>
        </label>
        <label style={{ display: 'block', marginTop: 12 }}>
          Markdown post qoidasi (.md): {' '}
          <input type="file" accept=".md,text/markdown" disabled={!selectedChannel || busy} onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadPolicy(file);
            e.currentTarget.value = '';
          }} />
        </label>
        <p style={{ fontSize: 13, color: '#666' }}>Yuklangan fayl: {channels.find((item) => item.channelId === selectedChannel)?.policyFileName || 'hali yuklanmagan'}</p>
      </div>

      <form onSubmit={publish} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
        <h3>Rasmli post yaratish va yuborish</h3>
        <textarea value={topic} onChange={(e) => setTopic(e.target.value)} required disabled={!selectedChannel || busy} maxLength={500}
          placeholder="Post mavzusi: masalan, sun’iy intellekt bilan biznes jarayonlarini tezlashtirish" rows={4} style={{ width: '100%', boxSizing: 'border-box' }} />
        <button disabled={!selectedChannel || busy} style={{ marginTop: 10 }}>{busy ? 'Bajarilmoqda…' : 'Rasmli postni yuborish'}</button>
      </form>

      <h3 style={{ marginTop: 28 }}>Oxirgi postlar</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ textAlign: 'left' }}><th>Kanal</th><th>Holat</th><th>Matn</th></tr></thead>
        <tbody>{posts.map((post) => <tr key={post.id} style={{ borderTop: '1px solid #eee' }}><td>{post.channelId}</td><td>{post.status}</td><td>{post.caption.slice(0, 120)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
