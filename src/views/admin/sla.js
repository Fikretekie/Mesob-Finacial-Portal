// Response deadlines for support tickets, by priority. The owner edits these in
// the Support inbox; the defaults below apply until then.
export const SLA_DEFAULTS = {
  hours: { urgent: 2, high: 8, normal: 24, low: 72 },
  escalateTo: "",
};

const lastCustomerAt = (t) => {
  // The clock runs from the oldest customer message still waiting for a reply.
  let since = null;
  t.messages.forEach((m) => {
    if (m.from === "customer") since = since || m.at;
    else since = null;
  });
  return since;
};

/** { dueAt, msLeft, overdue, waiting } for a ticket under the given policy. */
export function ticketDue(t, policy) {
  const p = policy || SLA_DEFAULTS;
  const since = t.status === "resolved" ? null : lastCustomerAt(t);
  if (!since) return { dueAt: null, msLeft: null, overdue: false, waiting: false };
  const hours = (p.hours || SLA_DEFAULTS.hours)[t.priority] ?? 24;
  const dueAt = new Date(new Date(since).getTime() + hours * 3600000);
  const msLeft = dueAt - Date.now();
  return { dueAt, msLeft, overdue: msLeft < 0, waiting: true };
}

export const fmtLeft = (ms) => {
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600000);
  const m = Math.round((abs % 3600000) / 60000);
  const text = h >= 48 ? `${Math.round(h / 24)}d` : h ? `${h}h ${m}m` : `${m}m`;
  return ms < 0 ? `${text} overdue` : `${text} left`;
};
