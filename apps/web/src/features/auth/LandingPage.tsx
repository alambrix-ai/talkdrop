import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button, Card, Tag, VideoTile } from '@talkdrop/ui';
import { api } from '../../lib/api';

export default function LandingPage() {
  const stats = useQuery({
    queryKey: ['public-stats'],
    queryFn: () =>
      api<{
        online: number;
        medianConversationSec: number;
        reportsPer1000: number;
        languages: number;
      }>('/public/stats', { auth: false }),
  });

  const online = stats.data?.online ?? 128400;

  return (
    <main>
      <section className="shell page" style={{ paddingTop: 40 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.95fr)',
            gap: 40,
            alignItems: 'center',
          }}
          className="hero-grid"
        >
          <div>
            <Tag variant="mint">
              <span className="live" /> {online.toLocaleString()} people online now
            </Tag>
            <h1 className="h1" style={{ marginTop: 20 }}>
              Meet someone new, live. Without the weirdness.
            </h1>
            <p className="mute" style={{ marginTop: 16, fontSize: 18, maxWidth: 480 }}>
              Talkdrop is interest-first video chat with verified adults, live AI safety, and
              openers that make the first ten seconds easy.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
              <Link to="/verify">
                <Button>Start a conversation</Button>
              </Link>
              <a href="#safety">
                <Button variant="ghost">See how safety works</Button>
              </a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
              <Tag variant="deep">18+ verified</Tag>
              <Tag variant="deep">Live AI moderation</Tag>
              <Tag variant="deep">No recordings kept</Tag>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{ position: 'relative', minHeight: 420 }}
          >
            <VideoTile
              className="hero-tile-a"
              style={{
                width: '68%',
                aspectRatio: '3/4',
                transform: 'rotate(-6deg)',
                boxShadow: 'var(--shadow)',
              }}
              overlays={
                <span className="tag mint" style={{ position: 'absolute', left: 12, bottom: 12 }}>
                  Mei, 24
                </span>
              }
            />
            <VideoTile
              className="hero-tile-b"
              style={{
                width: '58%',
                aspectRatio: '3/4',
                position: 'absolute',
                right: 0,
                top: 48,
                transform: 'rotate(7deg)',
                boxShadow: 'var(--shadow)',
              }}
              overlays={
                <span className="tag mint" style={{ position: 'absolute', left: 12, bottom: 12 }}>
                  Tomás, 26
                </span>
              }
            />
            <Card
              tone="cream"
              style={{
                position: 'absolute',
                left: '8%',
                bottom: 24,
                padding: 16,
                width: 'min(280px, 80%)',
                boxShadow: 'var(--shadow)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700 }}>You both like</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                <Tag variant="rose">Jazz</Tag>
                <Tag variant="rose">Night walks</Tag>
                <Tag variant="rose">Street food</Tag>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 14 }}>
                Icebreaker: What song have you replayed all week?
              </p>
            </Card>
          </motion.div>
        </div>
      </section>

      <section className="shell" style={{ paddingBottom: 48 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
          }}
          className="stats-grid"
        >
          <Stat label="Online now" value={online.toLocaleString()} />
          <Stat label="Median conversation" value="6 min 42 s" />
          <Stat label="Reports / 1,000 calls" value="1.8" />
          <Stat label="Languages" value="41" />
        </div>
      </section>

      <section className="shell" style={{ paddingBottom: 64 }}>
        <h2 className="h2">How it works</h2>
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 24 }}
          className="three-col"
        >
          <Step title="Verify once" body="On-device age check. Your face never leaves your device." />
          <Step title="Pick your vibe" body="Interests, mood, and languages steer who you meet." />
          <Step title="Say hello" body="Blur-first start, AI icebreakers, then talk when you are ready." />
        </div>
      </section>

      <section id="safety" className="shell" style={{ paddingBottom: 64 }}>
        <h2 className="h2">Safety you can see</h2>
        <div
          style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20, marginTop: 24 }}
          className="two-col"
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {[
              '18+ verification before matching',
              'Live frame and text moderation with instant cut',
              'Report and block end the call for both people',
              'Evidence clips encrypted and deleted after 24 hours',
            ].map((t) => (
              <Card key={t} style={{ padding: 18 }}>
                {t}
              </Card>
            ))}
          </div>
          <Card tone="cream" style={{ padding: 24 }}>
            <Tag variant="mint">
              <span className="live" /> Live session check
            </Tag>
            <h3 className="h3" style={{ marginTop: 16 }}>
              AI safety on every call
            </h3>
            <p className="mute" style={{ marginTop: 10 }}>
              Talkdrop samples low-resolution frames for classifiers — never stores raw video or
              audio by default.
            </p>
          </Card>
        </div>
      </section>

      <section className="shell" style={{ paddingBottom: 64 }}>
        <h2 className="h2">Rooms and activities</h2>
        <p className="mute" style={{ marginTop: 8 }}>Coming in v1 — preview tonight&apos;s ideas.</p>
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 24 }}
          className="three-col"
        >
          <Card style={{ padding: 20 }}>
            <Tag>8:30 PM</Tag>
            <h3 className="h3" style={{ marginTop: 12 }}>Speak Spanish night</h3>
          </Card>
          <Card style={{ padding: 20 }}>
            <Tag>9:00 PM</Tag>
            <h3 className="h3" style={{ marginTop: 12 }}>Startup pitch roulette</h3>
          </Card>
          <Card style={{ padding: 20 }}>
            <Tag>Open</Tag>
            <h3 className="h3" style={{ marginTop: 12 }}>Lo-fi listening room</h3>
          </Card>
        </div>
      </section>

      <section className="shell" style={{ paddingBottom: 80 }}>
        <Card tone="cream" style={{ padding: 32, justifyContent: 'center', display: 'grid', gap: 12, justifyItems: 'center' }}>
          <h2 className="h2" style={{ textAlign: 'center' }}>
            For teams and communities
          </h2>
          <p className="mute" style={{ textAlign: 'center', maxWidth: 520 }}>
            White-label language exchanges, campus events, and brand spaces with moderation you can
            audit.
          </p>
          <Link to="/admin">
            <Button>Talk to sales</Button>
          </Link>
        </Card>
      </section>

      <footer className="shell" style={{ paddingBottom: 40, border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, paddingTop: 24, fontSize: 14 }}>
          <span className="mute">© Talkdrop</span>
          <Link to="/legal/age-notice">18+ only</Link>
          <Link to="/legal/community-rules">Community rules</Link>
          <Link to="/legal/privacy">Privacy centre</Link>
          <Link to="/legal/transparency">Transparency report</Link>
          <Link to="/legal/terms">Terms</Link>
          <a href="mailto:hello@talkdrop.app">Contact</a>
        </div>
      </footer>

      <style>{`
        @media (max-width: 768px) {
          .hero-grid, .stats-grid, .three-col, .two-col { grid-template-columns: 1fr !important; }
          .hero-grid { gap: 28px !important; }
        }
      `}</style>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ padding: 18 }}>
      <div className="mute" style={{ fontSize: 13, fontWeight: 600 }}>
        {label}
      </div>
      <div className="disp" style={{ fontSize: 28, marginTop: 6 }}>
        {value}
      </div>
    </Card>
  );
}

function Step({ title, body }: { title: string; body: string }) {
  return (
    <Card style={{ padding: 22 }}>
      <h3 className="h3">{title}</h3>
      <p className="mute" style={{ marginTop: 10 }}>
        {body}
      </p>
    </Card>
  );
}
