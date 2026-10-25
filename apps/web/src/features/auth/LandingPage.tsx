import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button, Card, Logo, Tag, VideoTile } from '@talkdrop/ui';
import { SafetyStrip } from '../../components/SafetyStrip';
import { api } from '../../lib/api';
import { PORTRAITS } from '../../lib/portraits';
import { LANDING_VIBE_ROOMS } from '../../lib/vibeRooms';

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
  const medianMin = Math.floor((stats.data?.medianConversationSec ?? 402) / 60);
  const medianSec = String((stats.data?.medianConversationSec ?? 402) % 60).padStart(2, '0');

  return (
    <main>
      <section className="shell page" style={{ paddingTop: 28 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.95fr)',
            gap: 40,
            alignItems: 'center',
          }}
          className="hero-grid"
        >
          <div className="wash-in">
            <Tag variant="mint">
              <span className="live" /> {online.toLocaleString()} people hanging out now
            </Tag>
            <div style={{ marginTop: 22 }}>
              <Logo height={56} />
            </div>
            <h1 className="h1" style={{ marginTop: 18, maxWidth: 560 }}>
              Drop in. Hit it off. Keep it light.
            </h1>
            <p className="mute" style={{ marginTop: 16, fontSize: 18, maxWidth: 480 }}>
              Live video hangouts with people who share your vibe — icebreakers, co-play, and
              safety that stays on so the fun never gets weird.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
              <Link to="/verify">
                <Button>Start hanging out</Button>
              </Link>
              <a href="#safety">
                <Button variant="ghost">How we keep it safe</Button>
              </a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
              <Tag variant="deep">18+ verified</Tag>
              <Tag variant="deep">Live AI moderation</Tag>
              <Tag variant="deep">Privacy-first defaults</Tag>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="float-soft"
            style={{ position: 'relative', minHeight: 420 }}
          >
            <VideoTile
              className="hero-tile-a"
              placeholder={false}
              imageSrc={PORTRAITS.mei.src}
              imageAlt={PORTRAITS.mei.label}
              style={{
                width: '68%',
                aspectRatio: '3/4',
                transform: 'rotate(-6deg)',
                boxShadow: 'var(--shadow)',
              }}
              overlays={
                <span className="tag mint" style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 3 }}>
                  {PORTRAITS.mei.label}
                </span>
              }
            />
            <VideoTile
              className="hero-tile-b"
              placeholder={false}
              imageSrc={PORTRAITS.tomas.src}
              imageAlt={PORTRAITS.tomas.label}
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
                <span className="tag mint" style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 3 }}>
                  {PORTRAITS.tomas.label}
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
                zIndex: 4,
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

      <section className="shell" style={{ paddingBottom: 36 }}>
        <SafetyStrip />
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
          <Stat label="Typical hang" value={`${medianMin} min ${medianSec} s`} />
          <Stat
            label="Reports / 1,000 calls"
            value={String(stats.data?.reportsPer1000 ?? 1.8)}
          />
          <Stat label="Languages" value={String(stats.data?.languages ?? 41)} />
        </div>
      </section>

      <section className="shell" style={{ paddingBottom: 64 }}>
        <h2 className="h2">Three beats to the hangout</h2>
        <p className="mute" style={{ marginTop: 8, maxWidth: 520 }}>
          No corporate onboarding maze — just verify, pick a vibe, and say hey.
        </p>
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 24 }}
          className="three-col"
        >
          <Step
            title="Verify once"
            body="Sign in, then a simple Yes / No that you are 18+. No camera age scan, no ID upload."
          />
          <Step
            title="Pick your vibe"
            body="Interests, mood, and languages steer who you meet. Chill, curious, debate, or play a game."
          />
          <Step
            title="Drop in live"
            body="Blur-first start, playful openers, then talk, co-draw, or co-watch when it clicks."
          />
        </div>
      </section>

      <section id="safety" className="shell" style={{ paddingBottom: 64 }}>
        <h2 className="h2">Fun first. Safety always.</h2>
        <p className="mute" style={{ marginTop: 8, maxWidth: 540 }}>
          Entertainment energy does not mean anything-goes. Consent, reporting, and privacy defaults
          are built into every hangout — not buried in a footer.
        </p>
        <div
          style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20, marginTop: 24 }}
          className="two-col"
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {[
              '18+ Yes/No confirmation before anyone enters the pool',
              'Live frame and text moderation with an instant cut',
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
              audio by default. You stay in control with blur-first and camera-by-consent.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              <Tag variant="deep">Blur first 15 s</Tag>
              <Tag variant="deep">Camera by consent</Tag>
              <Tag variant="deep">Report / block</Tag>
            </div>
          </Card>
        </div>
      </section>

      <section className="shell" style={{ paddingBottom: 64 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline' }}>
          <h2 className="h2" style={{ margin: 0 }}>
            Vibe rooms
          </h2>
          <Tag variant="mint">Preview</Tag>
        </div>
        <p className="mute" style={{ marginTop: 8, maxWidth: 520 }}>
          Shared energy, no schedule. Peek in when you want company — rooms are warming up for
          launch.
        </p>
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 24 }}
          className="three-col"
        >
          {LANDING_VIBE_ROOMS.map((room) => (
            <Card key={room.title} style={{ padding: 20 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Tag variant="mint">{room.energy}</Tag>
                <Tag variant="rose">{room.vibe}</Tag>
              </div>
              <h3 className="h3" style={{ marginTop: 12 }}>
                {room.title}
              </h3>
              <p className="mute" style={{ marginTop: 8, fontSize: 14 }}>
                {room.blurb}
              </p>
              <p className="mute" style={{ marginTop: 12, fontSize: 13 }}>
                {room.people.toLocaleString()} hanging out · Soon
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section className="shell" style={{ paddingBottom: 80 }}>
        <Card
          tone="cream"
          style={{
            padding: 36,
            textAlign: 'center',
            display: 'grid',
            gap: 14,
            justifyItems: 'center',
          }}
        >
          <Tag variant="mint">Adults only · 18+</Tag>
          <h2 className="h2" style={{ textAlign: 'center', maxWidth: 640 }}>
            Ready for a low-stakes, high-smile hangout?
          </h2>
          <p className="mute" style={{ textAlign: 'center', maxWidth: 480 }}>
            Meet someone new in minutes. Keep the ones who click. Skip the rest — with privacy and
            safety still on.
          </p>
          <Link to="/verify">
            <Button>Jump in</Button>
          </Link>
        </Card>
      </section>

      <footer className="shell" style={{ paddingBottom: 40, borderTop: '1px solid var(--line)' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            paddingTop: 24,
            fontSize: 14,
            alignItems: 'center',
          }}
        >
          <span className="mute">© Talkdrop — hang out kindly</span>
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
          .float-soft { animation: none; }
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
