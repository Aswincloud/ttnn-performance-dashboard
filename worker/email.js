// Resend transactional email + HTML builders. Mirrors the look of the old
// check_perf_changes.py format_email_body, adapted for per-subscriber alerts
// with double opt-in confirmation and unsubscribe links.

const RESEND_URL = 'https://api.resend.com/emails';

// Low-level send. Returns { ok, status, body }.
export async function sendEmail(env, { to, subject, html }) {
  const from = env.FROM_EMAIL || 'TTNN Alerts <onboarding@resend.dev>';
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const SHELL_STYLE = `
  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
  .header { background-color: #e7f1ff; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
  .summary { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
  .operation { border-left: 4px solid #dc3545; padding: 10px; margin: 10px 0; background-color: #fff; }
  .operation.improvement { border-left-color: #28a745; }
  .regression { color: #dc3545; font-weight: bold; }
  .improvement { color: #28a745; font-weight: bold; }
  .metric { font-family: monospace; background-color: #f8f9fa; padding: 2px 6px; border-radius: 3px; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background-color: #f8f9fa; }
  .btn { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: bold; }
  .muted { color: #6c757d; font-size: 12px; }
  a.unsub { color: #6c757d; }
`;

function page(inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${SHELL_STYLE}</style></head><body>${inner}</body></html>`;
}

// "Confirm your subscription" email (double opt-in).
export function confirmationEmail({ siteUrl, confirmUrl, improve_pct, degrade_pct }) {
  const watching = [];
  if (improve_pct != null) watching.push(`improvements ≥ <strong>${esc(improve_pct)}%</strong>`);
  if (degrade_pct != null) watching.push(`degradations ≥ <strong>${esc(degrade_pct)}%</strong>`);

  const html = page(`
    <div class="header">
      <h2>Confirm your TTNN performance alerts</h2>
      <p>You (or someone using this address) asked to be alerted about TTNN eltwise
         performance changes.</p>
    </div>
    <p>You'll be notified about: ${watching.join(' and ')}.</p>
    <p style="margin: 24px 0;">
      <a href="${esc(confirmUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;font-family:Arial,sans-serif;">Confirm subscription</a>
    </p>
    <p class="muted">If you didn't request this, just ignore this email — no alerts are sent
       until you confirm. Or paste this link into your browser:<br>
       <a href="${esc(confirmUrl)}">${esc(confirmUrl)}</a></p>
    <hr>
    <p class="muted">TTNN Performance Dashboard · <a href="${esc(siteUrl)}">${esc(siteUrl)}</a></p>
  `);

  return { subject: 'Confirm your TTNN performance alerts', html };
}

function opBlock(op) {
  const improvement = op.change_type === 'improvement';
  const sign = op.change_percent > 0 ? '+' : '';
  const diffNs = op.latest_avg_ns - op.previous_avg_ns;
  return `
    <div class="operation ${improvement ? 'improvement' : ''}">
      <h4>${esc(op.operation_name)}</h4>
      <p class="${improvement ? 'improvement' : 'regression'}">
        Change: ${sign}${op.change_percent.toFixed(2)}% ${improvement ? '(faster)' : '(slower)'}
      </p>
      <table>
        <tr><th>Metric</th><th>Previous</th><th>Latest</th><th>Difference</th></tr>
        <tr>
          <td>Average Duration (ns)</td>
          <td class="metric">${op.previous_avg_ns.toFixed(2)}</td>
          <td class="metric">${op.latest_avg_ns.toFixed(2)}</td>
          <td class="metric">${diffNs.toFixed(2)}</td>
        </tr>
      </table>
    </div>`;
}

// Tailored alert email for one subscriber: only the ops that crossed THEIR
// thresholds, split into degradations and improvements, with an unsubscribe link.
export function alertEmail({ siteUrl, unsubscribeUrl, subscriber, ops, meta }) {
  const sorted = [...ops].sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent));
  const regressions = sorted.filter((o) => o.change_type === 'regression');
  const improvements = sorted.filter((o) => o.change_type === 'improvement');

  const watchParts = [];
  if (subscriber.improve_pct != null) watchParts.push(`improvements ≥ ${subscriber.improve_pct}%`);
  if (subscriber.degrade_pct != null) watchParts.push(`degradations ≥ ${subscriber.degrade_pct}%`);

  const commit = (meta.git_commit_id || 'unknown').slice(0, 8);

  let body = `
    <div class="header">
      <h2>TTNN Performance Alert</h2>
      <p>${sorted.length} operation(s) crossed your thresholds (${esc(watchParts.join(', '))}).</p>
    </div>
    <div class="summary">
      <table>
        <tr><th>Metric</th><th>Count</th></tr>
        <tr style="background-color:#f8d7da;"><td>Degradations (slower)</td><td><strong>${regressions.length}</strong></td></tr>
        <tr style="background-color:#d4edda;"><td>Improvements (faster)</td><td><strong>${improvements.length}</strong></td></tr>
      </table>
      <p>
        <strong>Latest:</strong> ${esc(meta.measurement_date || 'unknown')}<br>
        <strong>Previous:</strong> ${esc(meta.previous_date || 'unknown')}<br>
        <strong>Git Commit:</strong> <code>${esc(commit)}</code>
      </p>
    </div>`;

  if (regressions.length) {
    body += `<h3 style="color:#dc3545;">⬇️ Degradations (slower)</h3>${regressions.map(opBlock).join('')}`;
  }
  if (improvements.length) {
    body += `<h3 style="color:#28a745;">⬆️ Improvements (faster)</h3>${improvements.map(opBlock).join('')}`;
  }

  body += `
    <hr>
    <p class="muted">
      Automated alert from the <a href="${esc(siteUrl)}">TTNN Performance Dashboard</a>.<br>
      <a class="unsub" href="${esc(unsubscribeUrl)}">Unsubscribe</a> from these alerts.
    </p>`;

  const subject = `TTNN Performance Alert: ${sorted.length} operation(s) crossed your thresholds`;
  return { subject, html: page(body) };
}
