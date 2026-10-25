import { useState } from 'react';
import { REPORT_CATEGORY_LABELS, type ReportCategory } from '@talkdrop/shared';
import { Button, Modal, Textarea } from '@talkdrop/ui';
import { api } from '../../lib/api';

export function ReportSheet({
  open,
  name,
  sessionId,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  name: string;
  sessionId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [category, setCategory] = useState<ReportCategory>('harassment');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      await api('/reports', {
        method: 'POST',
        json: { sessionId, category, details: details || undefined, alsoBlock },
      });
      onSubmitted();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`Report ${name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" loading={loading} onClick={() => void submit()}>
            Submit report
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <p className="mute" style={{ marginTop: 0 }}>
        Reporting ends the hangout for both of you right away. Thanks for helping keep Talkdrop
        safe.
      </p>
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {(Object.keys(REPORT_CATEGORY_LABELS) as ReportCategory[]).map((key) => (
          <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="radio"
              name="category"
              checked={category === key}
              onChange={() => setCategory(key)}
            />
            {REPORT_CATEGORY_LABELS[key]}
          </label>
        ))}
      </div>
      <Textarea
        style={{ marginTop: 12 }}
        placeholder="Optional details"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        aria-label="Report details"
      />
      <label style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
        <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />
        Also block {name}
      </label>
      <p className="mute" style={{ fontSize: 13, marginTop: 12 }}>
        Privacy note: a short encrypted clip is kept for review and deleted after 24 hours unless
        action is needed. We never keep full call recordings by default.
      </p>
    </Modal>
  );
}
