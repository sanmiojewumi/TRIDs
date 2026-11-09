import { useEffect, useMemo, useState } from 'preact/hooks';
import { formatMoney } from '../money';
import { pdfFileName, renderPdf, renderSvgPages } from '../render';
import type { InvoiceData, InvoiceRecord } from '../types';
import { canShareFile, downloadBlob, isNativeApp, shareBlob } from './util';

interface Props {
  data: InvoiceData;
  /** Present once the invoice has been saved. */
  record?: InvoiceRecord;
  /** Called for an unsaved draft; must persist it and return the saved record. */
  onIssue?: () => InvoiceRecord;
  onClose: () => void;
  onNew?: () => void;
  onDuplicate?: (record: InvoiceRecord) => void;
  onTogglePaid?: (record: InvoiceRecord) => void;
  onDelete?: (record: InvoiceRecord) => void;
}

export function Preview(props: Props) {
  const [record, setRecord] = useState(props.record);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const data = record?.data ?? props.data;
  const pages = useMemo(() => renderSvgPages(data), [data]);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setRecord(props.record);
  }, [props.record]);

  useEffect(() => {
    try {
      setCanShare(canShareFile(renderPdf(data), pdfFileName(data)));
    } catch {
      setCanShare(false);
    }
  }, [data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, []);

  const issueIfNeeded = (): InvoiceData | undefined => {
    if (record) return record.data;
    if (!props.onIssue) return data;
    try {
      const saved = props.onIssue();
      setRecord(saved);
      return saved.data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the invoice.');
      return undefined;
    }
  };

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      const d = issueIfNeeded();
      if (!d) return;
      await downloadBlob(renderPdf(d), pdfFileName(d));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the PDF.');
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const d = issueIfNeeded();
    if (!d) return;
    try {
      await shareBlob(renderPdf(d), pdfFileName(d), `Invoice ${d.ref}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sharing failed.');
    }
  };

  const draft = !record;
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-label="Invoice preview">
      <header class="overlay-bar">
        <button class="btn ghost" onClick={props.onClose}>
          {draft ? 'Back to edit' : 'Close'}
        </button>
        <div class="overlay-title">
          <strong>{data.ref}</strong>
          <span class={`badge ${draft ? 'draft' : record?.status}`}>{draft ? 'Preview' : record?.status === 'paid' ? 'Paid' : 'Saved'}</span>
        </div>
        <div class="overlay-total">{formatMoney(data.totals.total - (data.paid ?? 0))}</div>
      </header>
      <div class="overlay-body">
        {pages.map((svg, i) => (
          <div key={i} class="page" dangerouslySetInnerHTML={{ __html: svg }} />
        ))}
      </div>
      <footer class="overlay-actions">
        {error && <div class="error">{error}</div>}
        {draft && <p class="hint center">Saving assigns reference {data.ref} and keeps a copy in Invoices.</p>}
        <div class="row wrap">
          <button class="btn primary grow" disabled={busy} onClick={download}>
            {isNativeApp() ? (draft ? 'Save & share PDF' : 'Share PDF') : draft ? 'Save & download PDF' : 'Download PDF'}
          </button>
          {canShare && (
            <button class="btn" onClick={share}>
              Share
            </button>
          )}
        </div>
        {record && (
          <div class="row wrap">
            {props.onNew && (
              <button class="btn" onClick={props.onNew}>
                New invoice
              </button>
            )}
            {props.onDuplicate && (
              <button class="btn" onClick={() => props.onDuplicate!(record)}>
                Duplicate
              </button>
            )}
            {props.onTogglePaid && (
              <button
                class="btn"
                onClick={() => {
                  props.onTogglePaid!(record);
                  setRecord({ ...record, status: record.status === 'paid' ? 'unpaid' : 'paid' });
                }}
              >
                {record.status === 'paid' ? 'Mark unpaid' : 'Mark paid'}
              </button>
            )}
            {props.onDelete && (
              <button
                class="btn danger"
                onClick={() => {
                  if (confirm(`Delete ${record.ref}? The reference number will not be reused.`)) props.onDelete!(record);
                }}
              >
                Delete
              </button>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}
