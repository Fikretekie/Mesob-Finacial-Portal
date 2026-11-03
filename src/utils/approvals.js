import { getData, putData, deleteData, billingAction } from "utils/adminData";
import { updateUser, saveConfig, logAudit } from "utils/adminApi";

// Risky actions a staff member can ask for but only the owner can carry out.
// The owner chooses which ones need approval in Approvals → Settings.
export const RISKY = {
  "billing.refund": "Refund a payment",
  "billing.cancel": "Cancel a subscription",
  "request.delete": "Delete an account on request",
  "recycle.purge": "Permanently delete from the recycle bin",
  "user.suspend": "Suspend a customer",
  "site.publish": "Publish site settings",
  "policy.publish": "Publish a policy",
};

const me = () => localStorage.getItem("user_email") || "staff";

// What actually runs once the owner approves. Payloads carry everything needed.
const EXECUTORS = {
  "billing.refund": (p) => billingAction(p.row, "refund", p.opts),
  "billing.cancel": (p) => billingAction(p.row, "cancel", p.opts),
  "request.delete": async (p) => {
    const { data } = await getData("requests");
    const r = (data || []).find((x) => x.id === p.requestId);
    if (r) await putData("requests", { ...r, status: "completed", completedAt: new Date().toISOString(), handledBy: me() }, { action: "request.delete", target: r.email, detail: "approved" });
  },
  "recycle.purge": (p) => deleteData("recycle", p.item, { action: "recycle.purge", target: p.item.email, detail: p.item.label }),
  "user.suspend": (p) => updateUser(p.userId, { disabled: true, disabledAt: new Date().toISOString() }, { action: "user.suspend", target: p.email, detail: "approved" }),
  "site.publish": (p) => saveConfig(p.config, p.action, p.detail),
  "policy.publish": (p) => saveConfig(p.config, p.action, p.detail),
};

/**
 * Runs `run` straight away for the owner (or when approval isn't required for
 * this kind); otherwise files an approval request. Returns { pending } so the
 * caller can tell the user what happened.
 */
export async function submitOrRun(kind, access, { summary, reason = "", payload }, run) {
  if (access.isOwner) {
    await run();
    return { pending: false };
  }
  const { data: policy } = await getData("approvalPolicy");
  if (policy && policy.required?.[kind] === false) {
    await run();
    return { pending: false };
  }
  await putData(
    "approvals",
    { id: `ap${Date.now()}`, kind, status: "pending", by: me(), at: new Date().toISOString(), summary, reason, payload },
    { action: "approval.request", target: summary, detail: reason }
  );
  return { pending: true };
}

export async function decide(item, approve, note = "") {
  if (approve) {
    const exec = EXECUTORS[item.kind];
    if (exec) await exec(item.payload || {});
  }
  await putData("approvals", { ...item, status: approve ? "approved" : "rejected", decidedAt: new Date().toISOString(), decidedBy: me(), note });
  await logAudit(approve ? "approval.approve" : "approval.reject", item.summary, note || item.by);
}
