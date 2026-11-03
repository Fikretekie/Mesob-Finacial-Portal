// Meksova owner console backend — Lambda `mesob-admin-<env>` (Node.js 20).
//
// One function behind these API Gateway routes (Cognito authorizer on all
// except GET /SiteConfig and OPTIONS):
//   GET  /SiteConfig                 public: banner, maintenance, features, policies
//   PUT  /SiteConfig                 owner / staff with site.manage or policies.publish
//   ANY  /AdminData/{proxy+}         users, subscriptions, transactions, console collections
//   ANY  /AdminStaff[/{id}]          owner only: staff logins (Cognito) + permissions
//   GET|POST /AdminMessages          broadcasts (stored; emailed via SES when SES_FROM is set)
//   GET|POST /AdminAudit             activity log
//
// Who may do what is decided HERE from the caller's Users record (role 0 =
// owner, role 3 = staff with staffPermissions) — the console's own hiding of
// buttons is only a convenience.
//
// Env: ADMIN_TABLE, USERS_TABLE, USERS_KEY (default "id"), TX_TABLE,
//      TX_USER_INDEX (optional GSI on userId), SUBS_TABLE (optional),
//      POOL_ID (Cognito pool for staff logins), SES_FROM (optional).

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminDeleteUserCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const cognito = new CognitoIdentityProviderClient({});
const ses = new SESClient({});

const E = process.env;
const ADMIN = E.ADMIN_TABLE;
const USERS = E.USERS_TABLE;
const USERS_KEY = E.USERS_KEY || "id";

/* ------------------------------------------------------------ helpers -- */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};
const reply = (status, body) => ({ statusCode: status, headers: { ...CORS, "Content-Type": "application/json" }, body: body === undefined ? "" : JSON.stringify(body) });
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const deny = (msg = "You don't have permission to do that") => {
  throw new HttpError(403, msg);
};

async function scanAll(params) {
  const out = [];
  let ExclusiveStartKey;
  do {
    const r = await ddb.send(new ScanCommand({ ...params, ExclusiveStartKey }));
    out.push(...(r.Items || []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

// Admin data lives in ADMIN_TABLE as { collection, id, doc }.
const getDoc = async (collection, id) => (await ddb.send(new GetCommand({ TableName: ADMIN, Key: { collection, id } }))).Item?.doc;
const putDoc = (collection, id, doc) => ddb.send(new PutCommand({ TableName: ADMIN, Item: { collection, id, doc, updatedAt: new Date().toISOString() } }));
const delDoc = (collection, id) => ddb.send(new DeleteCommand({ TableName: ADMIN, Key: { collection, id } }));
async function listDocs(collection, { newestFirst = false, limit } = {}) {
  const out = [];
  let ExclusiveStartKey;
  do {
    const r = await ddb.send(new QueryCommand({ TableName: ADMIN, KeyConditionExpression: "#c = :c", ExpressionAttributeNames: { "#c": "collection" }, ExpressionAttributeValues: { ":c": collection }, ScanIndexForward: !newestFirst, ExclusiveStartKey, Limit: limit }));
    out.push(...(r.Items || []).map((i) => i.doc));
    ExclusiveStartKey = limit && out.length >= limit ? undefined : r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

const getUser = async (id) => (await ddb.send(new GetCommand({ TableName: USERS, Key: { [USERS_KEY]: id } }))).Item;

/* --------------------------------------------------------- the caller -- */

async function caller(event) {
  const claims = event.requestContext?.authorizer?.claims;
  if (!claims?.sub) throw new HttpError(401, "Sign in first");
  const me = await getUser(claims.sub);
  const role = Number(me?.role);
  const perms = new Set(Array.isArray(me?.staffPermissions) ? me.staffPermissions : []);
  return {
    sub: claims.sub,
    email: claims.email || me?.email || claims.sub,
    role,
    isOwner: role === 0,
    isStaff: role === 3 && !me?.disabled,
    can: (...keys) => role === 0 || (role === 3 && !me?.disabled && keys.some((k) => perms.has(k))),
  };
}
const requireConsole = (c) => {
  if (!c.isOwner && !c.isStaff) deny("Console access is for the owner and staff");
};

async function audit(c, action, target, detail = "") {
  const at = new Date().toISOString();
  await putDoc("audit", `${at}#${Math.random().toString(36).slice(2, 8)}`, { id: at, at, by: c.email, action, target, detail });
}

// Staff edits that the owner said need approval are refused server-side too.
async function staffMayPublish(c, kind) {
  if (c.isOwner) return true;
  const policy = await getDoc("approvalPolicy", "_doc");
  return policy?.required?.[kind] === false;
}

/* ------------------------------------------------- collection access -- */

// collection -> [read perms, write perms]. null write = owner only.
const COLLECTIONS = {
  tickets: [["support.reply"], ["support.reply"]],
  requests: [["requests.handle"], ["requests.handle"]],
  recycle: [["data.restore"], ["data.restore"]],
  automations: [["automations.manage", "rules.manage"], ["automations.manage"]],
  promos: [["promos.manage"], ["promos.manage"]],
  referral: [["promos.manage"], ["promos.manage"]],
  changelog: [["changelog.publish"], ["changelog.publish"]],
  articles: [["articles.manage", "support.reply"], ["articles.manage"]],
  rules: [["rules.manage"], ["rules.manage"]],
  issues: [["issues.manage"], ["issues.manage"]],
  siteContent: [["content.edit"], ["content.edit"]],
  slaPolicy: [["support.reply"], null],
  approvalPolicy: [["*"], null],
  alertSettings: [[], null],
  approvals: [["*"], ["*"]],
  notifications: [["*"], ["*"]],
};
const OBJECT_DOCS = new Set(["referral", "siteContent", "slaPolicy", "approvalPolicy", "alertSettings"]);
const canAny = (c, perms) => c.isOwner || (perms && (perms.includes("*") ? c.isStaff : c.can(...perms)));

/* ------------------------------------------------- users & directory -- */

const USER_FIELDS_EDIT = ["trialEndDate", "adminNote"];
const USER_FIELDS_ACCESS = ["compedAccess", "subscription", "disabled", "disabledAt"];

async function listUsers() {
  const items = await scanAll({ TableName: USERS });
  // Never send secrets or bulky blobs to the console.
  return items.map(({ password, receipts, ...u }) => ({ ...u, id: u[USERS_KEY] ?? u.id }));
}

async function updateUser(c, id, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) throw new HttpError(400, "Nothing to change");
  for (const k of keys) {
    if (k === "role" || k === "staffPermissions") {
      if (!c.isOwner) deny("Only the owner can change roles");
    } else if (USER_FIELDS_EDIT.includes(k)) {
      if (!c.can("users.edit")) deny();
    } else if (USER_FIELDS_ACCESS.includes(k)) {
      if (!c.can("users.access")) deny();
      if (k === "disabled" && patch.disabled && !(await staffMayPublish(c, "user.suspend"))) deny("Suspending needs the owner's approval");
    } else {
      throw new HttpError(400, `Field ${k} can't be changed from the console`);
    }
  }
  const names = { "#k": USERS_KEY };
  const values = {};
  const sets = keys.map((k, i) => {
    names[`#f${i}`] = k;
    values[`:v${i}`] = patch[k];
    return `#f${i} = :v${i}`;
  });
  try {
    await ddb.send(new UpdateCommand({ TableName: USERS, Key: { [USERS_KEY]: id }, UpdateExpression: `SET ${sets.join(", ")}`, ConditionExpression: "attribute_exists(#k)", ExpressionAttributeNames: names, ExpressionAttributeValues: values }));
  } catch (e) {
    if (e.name === "ConditionalCheckFailedException") throw new HttpError(404, "No such customer");
    throw e;
  }
  // Suspending really blocks sign-in.
  if ("disabled" in patch && E.POOL_ID) {
    const u = await getUser(id);
    const username = await cognitoUsername(u?.email || id);
    if (username) await cognito.send(new (patch.disabled ? AdminDisableUserCommand : AdminEnableUserCommand)({ UserPoolId: E.POOL_ID, Username: username }));
  }
}
async function cognitoUsername(emailOrSub) {
  const filter = emailOrSub.includes("@") ? `email = "${emailOrSub}"` : `sub = "${emailOrSub}"`;
  const r = await cognito.send(new ListUsersCommand({ UserPoolId: E.POOL_ID, Filter: filter, Limit: 1 }));
  return r.Users?.[0]?.Username || null;
}

async function transactionsFor(userId) {
  if (!E.TX_TABLE) throw new HttpError(501, "TX_TABLE isn't configured");
  if (E.TX_USER_INDEX) {
    const out = [];
    let ExclusiveStartKey;
    do {
      const r = await ddb.send(new QueryCommand({ TableName: E.TX_TABLE, IndexName: E.TX_USER_INDEX, KeyConditionExpression: "userId = :u", ExpressionAttributeValues: { ":u": userId }, ExclusiveStartKey }));
      out.push(...(r.Items || []));
      ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
  }
  return scanAll({ TableName: E.TX_TABLE, FilterExpression: "userId = :u", ExpressionAttributeValues: { ":u": userId } });
}

/* ------------------------------------------------------------- staff -- */

async function inviteStaff(c, b) {
  if (!E.POOL_ID) throw new HttpError(501, "POOL_ID isn't configured");
  const email = String(b.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "A valid email is needed");
  if (await cognitoUsername(email)) throw new HttpError(409, "That email already has a Meksova login");
  // Cognito emails a temporary password; they set their own on first sign-in.
  const r = await cognito.send(new AdminCreateUserCommand({ UserPoolId: E.POOL_ID, Username: email, DesiredDeliveryMediums: ["EMAIL"], UserAttributes: [{ Name: "email", Value: email }, { Name: "email_verified", Value: "true" }, ...(b.name ? [{ Name: "name", Value: b.name }] : [])] }));
  const sub = r.User.Attributes.find((a) => a.Name === "sub").Value;
  const now = new Date().toISOString();
  await ddb.send(new PutCommand({ TableName: USERS, Item: { [USERS_KEY]: sub, email, name: b.name || "", role: 3, staffPermissions: b.perms || [], requireMfa: b.requireMfa !== false, staffStatus: "invited", createdAt: now, invitedBy: c.email }, ConditionExpression: `attribute_not_exists(#k)`, ExpressionAttributeNames: { "#k": USERS_KEY } }));
  await audit(c, "staff.invite", email, `${(b.perms || []).length} permissions`);
  return { id: sub, email, name: b.name || "", perms: b.perms || [], requireMfa: b.requireMfa !== false, status: "invited", invitedAt: now };
}

async function listStaffMembers() {
  const items = await scanAll({ TableName: USERS, FilterExpression: "#r = :r", ExpressionAttributeNames: { "#r": "role" }, ExpressionAttributeValues: { ":r": 3 } });
  return items.map((u) => ({ id: u[USERS_KEY], email: u.email, name: u.name || "", perms: u.staffPermissions || [], requireMfa: u.requireMfa !== false, status: u.disabled ? "disabled" : u.staffStatus || "active", invitedAt: u.createdAt, lastActiveAt: u.lastActiveAt || null }));
}

/* ---------------------------------------------------------- messages -- */

function inAudience(u, audience, ids) {
  if (audience === "direct") return ids.includes(u[USERS_KEY]);
  if (Number(u.role) !== 2 && Number(u.role) !== 1) return false;
  // Suspended accounts only hear from you when you pick them on purpose.
  if (u.disabled && audience !== "suspended") return false;
  const trialOn = u.trialEndDate && new Date(u.trialEndDate) > new Date();
  const paying = u.subscription === true || u.isPaid === true || u.compedAccess === true;
  switch (audience) {
    case "paying": return paying;
    case "trial": return !paying && trialOn;
    case "expired": return !paying && u.trialEndDate && !trialOn;
    case "suspended": return !!u.disabled;
    case "all": return !u.disabled;
    default: return false;
  }
}

async function sendBroadcast(c, b) {
  const users = await scanAll({ TableName: USERS });
  const targets = users.filter((u) => inAudience(u, b.audience, b.userIds || []) && u.email);
  const id = `${new Date().toISOString()}#${Math.random().toString(36).slice(2, 6)}`;
  let sent = 0;
  const scheduled = b.scheduledFor && new Date(b.scheduledFor) > new Date();
  if (!scheduled && E.SES_FROM && (b.channels || []).includes("email")) {
    for (const u of targets) {
      try {
        await ses.send(new SendEmailCommand({ Source: E.SES_FROM, Destination: { ToAddresses: [u.email] }, Message: { Subject: { Data: b.subject }, Body: { Text: { Data: `${b.body}${b.link ? `\n\n${b.link}` : ""}` } } } }));
        sent += 1;
      } catch (e) {
        console.error("SES send failed", u.email, e.name);
      }
    }
  }
  const record = { id, subject: b.subject, body: b.body, link: b.link, channels: b.channels, audience: b.audience, userIds: b.userIds, recipients: targets.length, emailed: sent, status: scheduled ? "scheduled" : E.SES_FROM ? "sent" : "stored", scheduledFor: b.scheduledFor, sentAt: scheduled ? undefined : new Date().toISOString(), by: c.email };
  await putDoc("messages", id, record);
  await audit(c, scheduled ? "message.schedule" : "message.send", `${targets.length} ${b.audienceLabel || b.audience}`, b.subject);
  return record;
}

/* ---------------------------------------------------- crash reports -- */

const sig = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `i${(h >>> 0).toString(36)}`;
};

// Each report folds into one issue per message+page, so 40 crashes = 1 row.
async function recordError(event, r) {
  const sub = event.requestContext?.authorizer?.claims?.sub || r.userId || "";
  const message = String(r.message || "Unknown error").slice(0, 300);
  const page = String(r.page || "").slice(0, 200);
  const id = sig(`${message}|${page}`);
  const now = new Date();
  const issue = (await getDoc("issues", id)) || { id, title: message.slice(0, 120), source: r.platform === "Android app" ? "app" : "frontend", platform: r.platform || "Web", area: page, feature: null, message, stack: String(r.stack || "").slice(0, 3000), page, release: r.release || "", firstSeen: now.toISOString(), count: 0, users: 0, userIds: [], status: "new", assignee: "", priority: "normal", notes: [], trend: Array(14).fill(0), trendDay: now.toISOString().slice(0, 10) };
  // Roll the 14-day trend forward to today.
  const shift = Math.max(0, Math.round((Date.parse(now.toISOString().slice(0, 10)) - Date.parse(issue.trendDay)) / 86400000));
  if (shift) issue.trend = [...issue.trend.slice(Math.min(14, shift)), ...Array(Math.min(14, shift)).fill(0)];
  issue.trendDay = now.toISOString().slice(0, 10);
  issue.trend[13] += 1;
  issue.count += 1;
  issue.lastSeen = now.toISOString();
  if (sub && !issue.userIds.includes(sub) && issue.userIds.length < 500) issue.userIds.push(sub);
  issue.users = Math.max(1, issue.userIds.length);
  if (issue.status === "fixed") issue.status = "new"; // it came back
  await putDoc("issues", id, issue);
}

/* ------------------------------------------------------------ router -- */

const json = (event) => {
  try {
    return event.body ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body) : {};
  } catch (e) {
    throw new HttpError(400, "Body must be JSON");
  }
};

async function route(event) {
  const method = event.httpMethod;
  if (method === "OPTIONS") return reply(204);
  const path = event.path.replace(/^.*?\/(SiteConfig|AdminData|AdminStaff|AdminMessages|AdminAudit)/, "$1");
  const [root, ...rest] = path.split("/").filter(Boolean);
  const q = event.queryStringParameters || {};

  /* ---- SiteConfig ---- */
  if (root === "SiteConfig") {
    if (method === "GET") return reply(200, (await getDoc("config", "site")) || {});
    if (method === "PUT") {
      const c = await caller(event);
      if (!c.can("site.manage", "policies.publish")) deny();
      if (!(await staffMayPublish(c, "site.publish"))) deny("Publishing needs the owner's approval");
      const body = json(event);
      await putDoc("config", "site", { ...body, updatedAt: new Date().toISOString(), updatedBy: c.email });
      return reply(200, { ok: true });
    }
  }

  const c = await caller(event);

  /* ---- Crash reports: any signed-in user may append ---- */
  if (root === "AdminData" && rest[0] === "errors" && method === "POST") {
    await recordError(event, json(event));
    return reply(202, { ok: true });
  }

  requireConsole(c);

  /* ---- AdminAudit ---- */
  if (root === "AdminAudit") {
    if (method === "GET") {
      if (!c.can("activity.view")) deny();
      return reply(200, { entries: await listDocs("audit", { newestFirst: true, limit: 500 }) });
    }
    if (method === "POST") {
      const b = json(event);
      await audit(c, String(b.action || "").slice(0, 60), String(b.target || "").slice(0, 200), String(b.detail || "").slice(0, 300));
      return reply(201, { ok: true });
    }
  }

  /* ---- AdminMessages ---- */
  if (root === "AdminMessages") {
    if (!c.can("messages.send")) deny();
    if (method === "GET") return reply(200, { messages: await listDocs("messages", { newestFirst: true, limit: 200 }) });
    if (method === "POST") return reply(201, await sendBroadcast(c, json(event)));
  }

  /* ---- AdminStaff (owner only) ---- */
  if (root === "AdminStaff") {
    if (!c.isOwner) deny("Only the owner manages staff");
    const id = rest[0];
    if (method === "GET") return reply(200, { staff: await listStaffMembers() });
    if (method === "POST") return reply(201, await inviteStaff(c, json(event)));
    if (!id) throw new HttpError(400, "Staff id missing");
    const u = await getUser(id);
    if (!u || Number(u.role) !== 3) throw new HttpError(404, "No such staff member");
    if (method === "PUT") {
      const b = json(event);
      const patch = {};
      if (Array.isArray(b.perms)) patch.staffPermissions = b.perms;
      if (typeof b.name === "string") patch.name = b.name;
      if (typeof b.requireMfa === "boolean") patch.requireMfa = b.requireMfa;
      if (b.status === "disabled" || b.status === "active") patch.disabled = b.status === "disabled";
      if (Object.keys(patch).length) {
        const names = {};
        const values = {};
        const sets = Object.keys(patch).map((k, i) => {
          names[`#f${i}`] = k;
          values[`:v${i}`] = patch[k];
          return `#f${i} = :v${i}`;
        });
        await ddb.send(new UpdateCommand({ TableName: USERS, Key: { [USERS_KEY]: id }, UpdateExpression: `SET ${sets.join(", ")}`, ExpressionAttributeNames: names, ExpressionAttributeValues: values }));
      }
      const username = await cognitoUsername(u.email);
      if (username && "disabled" in patch) await cognito.send(new (patch.disabled ? AdminDisableUserCommand : AdminEnableUserCommand)({ UserPoolId: E.POOL_ID, Username: username }));
      if (b.resendInvite && username) await cognito.send(new AdminCreateUserCommand({ UserPoolId: E.POOL_ID, Username: username, MessageAction: "RESEND", DesiredDeliveryMediums: ["EMAIL"] }));
      await audit(c, b.resendInvite ? "staff.resendInvite" : "status" in b ? (b.status === "disabled" ? "staff.disable" : "staff.enable") : "staff.update", u.email);
      return reply(200, { ok: true });
    }
    if (method === "DELETE") {
      const username = await cognitoUsername(u.email);
      if (username) await cognito.send(new AdminDeleteUserCommand({ UserPoolId: E.POOL_ID, Username: username }));
      await ddb.send(new DeleteCommand({ TableName: USERS, Key: { [USERS_KEY]: id } }));
      await audit(c, "staff.remove", u.email);
      return reply(200, { ok: true });
    }
  }

  /* ---- AdminData ---- */
  if (root === "AdminData") {
    const [name, id] = rest;

    if (name === "users") {
      if (method === "GET" && !id) {
        if (!c.can("users.view", "overview.view", "messages.send", "data.restore", "revenue.view")) deny();
        return reply(200, { items: await listUsers() });
      }
      if (method === "PUT" && id) {
        await updateUser(c, id, json(event));
        return reply(200, { ok: true });
      }
    }

    if (name === "subscriptions" && method === "GET") {
      if (!c.can("users.view", "overview.view", "revenue.view")) deny();
      if (!E.SUBS_TABLE) return reply(200, { items: [] });
      return reply(200, { items: await scanAll({ TableName: E.SUBS_TABLE }) });
    }

    if (name === "transactions") {
      if (method === "GET") {
        if (!c.can("users.view", "data.restore", "requests.handle", "users.export")) deny();
        if (!q.userId) throw new HttpError(400, "userId is required");
        return reply(200, { items: await transactionsFor(q.userId) });
      }
      if (method === "POST") {
        // Restoring a customer's deleted transactions.
        if (!c.can("data.restore")) deny();
        const b = json(event);
        if (!b.userId) throw new HttpError(400, "userId is required");
        const item = { ...b, id: b.id || `${Date.now()}${Math.random().toString(36).slice(2, 8)}`, restoredBy: c.email };
        await ddb.send(new PutCommand({ TableName: E.TX_TABLE, Item: item }));
        return reply(201, { id: item.id });
      }
    }

    // Not built yet (phase 2): Stripe billing and computed metrics.
    if (["invoices", "billing", "revenue", "usage", "health"].includes(name)) throw new HttpError(404, `${name} isn't connected yet`);

    const rules = COLLECTIONS[name];
    if (!rules) throw new HttpError(404, `Unknown collection ${name}`);
    const [readPerms, writePerms] = rules;

    if (method === "GET") {
      if (name === "alertSettings" ? !c.isOwner : !canAny(c, readPerms)) deny();
      if (OBJECT_DOCS.has(name)) return reply(200, (await getDoc(name, "_doc")) || null);
      return reply(200, { items: await listDocs(name, { newestFirst: true }) });
    }

    if (method === "PUT" || method === "POST") {
      const b = json(event);
      if (!canAny(c, writePerms)) {
        // Staff may file an approval request, and mark their own alerts read.
        if (!(name === "approvals" && b.status === "pending")) deny();
      }
      if (name === "approvals" && b.status !== "pending" && !c.isOwner) deny("Only the owner decides approvals");
      if (name === "siteContent" && !(await staffMayPublish(c, "site.publish"))) deny("Publishing needs the owner's approval");
      if (OBJECT_DOCS.has(name)) {
        await putDoc(name, "_doc", b);
      } else {
        const docId = id || b.id;
        if (!docId) throw new HttpError(400, "id is required");
        await putDoc(name, docId, { ...b, id: docId });
      }
      return reply(200, { ok: true });
    }

    if (method === "DELETE" && id) {
      if (!canAny(c, writePerms)) deny();
      await delDoc(name, id);
      return reply(200, { ok: true });
    }
  }

  throw new HttpError(404, "Not found");
}

export const handler = async (event) => {
  try {
    return await route(event);
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { message: e.message });
    console.error(e);
    return reply(500, { message: "Something went wrong on our side" });
  }
};
