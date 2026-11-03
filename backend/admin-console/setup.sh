#!/usr/bin/env bash
# Meksova owner console backend — one-shot setup for AWS CloudShell.
#
#   Upload this file in CloudShell (Actions → Upload file), then:
#     bash setup.sh staging    you@your-login-email.com
#     bash setup.sh production you@your-login-email.com   (after staging checks out)
#
# Safe to run more than once: it creates what's missing and updates the rest.
# Touches only the environment you name. Does not modify the MesobFinance Lambda.
set -euo pipefail

ENV_NAME="${1:-}"
OWNER_EMAIL="${2:-}"
case "$ENV_NAME" in
  staging)    POOL_ID="us-east-1_LLKrPQAEc" ;;
  production) POOL_ID="us-east-1_avAIOjCOE" ;;
  *) echo "Usage: bash $0 staging|production your-login@email.com"; exit 1 ;;
esac
REGION="us-east-1"
API_ID="iaqwrjhk4f"
AUTHORIZER_ID="apjxbd"
MONOLITH="MesobFinance:${ENV_NAME}"
FN="mesob-admin-${ENV_NAME}"
ROLE="mesob-admin-lambda-role"
ADMIN_TABLE="MesobAdminData_${ENV_NAME}"
SES_FROM="${SES_FROM:-}"

export AWS_DEFAULT_REGION="$REGION"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
say() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

if [ "$ENV_NAME" = "production" ]; then
  # Production only after the same code is running on staging.
  if ! aws lambda get-function --function-name mesob-admin-staging >/dev/null 2>&1; then
    echo "Set up staging first:  bash $0 staging your-login@email.com"; exit 1
  fi
fi

# ---------------------------------------------------------------------------
say "1/8 Finding the app's tables from ${MONOLITH}"
ENVJSON=$(aws lambda get-function-configuration --function-name "$MONOLITH" --query 'Environment.Variables' --output json)
# Staging tables carry "stag" in the setting name or table name; production ones don't.
pick() { echo "$ENVJSON" | python3 -c "
import json,sys,re
d=json.load(sys.stdin); want_stag=sys.argv[2]=='staging'
m=[v for k,v in d.items() if re.search(sys.argv[1],k,re.I) and re.search('table',k,re.I) and bool(re.search('stag',k+v,re.I))==want_stag]
print(m[0] if m else '')" "$1" "$ENV_NAME"; }
USERS_TABLE="${USERS_TABLE:-$(pick 'user')}"
TX_TABLE="${TX_TABLE:-$(pick 'transaction')}"
SUBS_TABLE="${SUBS_TABLE:-$(pick 'subscri')}"
echo "Users table:        ${USERS_TABLE:-NOT FOUND}"
echo "Transactions table: ${TX_TABLE:-NOT FOUND}"
echo "Subscriptions table:${SUBS_TABLE:- (none — subscription list will be empty)}"
if [ -z "$USERS_TABLE" ] || [ -z "$TX_TABLE" ]; then
  echo "Couldn't find the tables automatically. Re-run with USERS_TABLE=... TX_TABLE=... bash $0"
  echo "$ENVJSON"
  exit 1
fi
USERS_KEY=$(aws dynamodb describe-table --table-name "$USERS_TABLE" --query 'Table.KeySchema[?KeyType==`HASH`].AttributeName' --output text)
TX_USER_INDEX=$(aws dynamodb describe-table --table-name "$TX_TABLE" --query 'Table.GlobalSecondaryIndexes[?KeySchema[?AttributeName==`userId` && KeyType==`HASH`]].IndexName | [0]' --output text 2>/dev/null || true)
[ "$TX_USER_INDEX" = "None" ] && TX_USER_INDEX=""
echo "Users key: $USERS_KEY   Transactions userId index: ${TX_USER_INDEX:-none (will scan)}"

if [ "$ENV_NAME" = "production" ]; then
  echo
  echo "You're about to add the owner console to the LIVE app (app.meksova.com)."
  echo "Check the three table names above are the production ones."
  read -r -p "Type production to continue: " CONFIRM
  [ "$CONFIRM" = "production" ] || { echo "Stopped. Nothing was changed."; exit 1; }
fi

# ---------------------------------------------------------------------------
say "2/8 Admin data table ${ADMIN_TABLE}"
if ! aws dynamodb describe-table --table-name "$ADMIN_TABLE" >/dev/null 2>&1; then
  aws dynamodb create-table --table-name "$ADMIN_TABLE" \
    --attribute-definitions AttributeName=collection,AttributeType=S AttributeName=id,AttributeType=S \
    --key-schema AttributeName=collection,KeyType=HASH AttributeName=id,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST >/dev/null
  aws dynamodb wait table-exists --table-name "$ADMIN_TABLE"
  aws dynamodb update-continuous-backups --table-name "$ADMIN_TABLE" --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true >/dev/null
  echo "created (with point-in-time recovery)"
else
  echo "already exists"
fi

# ---------------------------------------------------------------------------
say "3/8 IAM role ${ROLE}"
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "created — waiting for IAM to propagate"
  sleep 12
fi
T="arn:aws:dynamodb:${REGION}:${ACCOUNT}:table"
SUBS_ARN=""
[ -n "$SUBS_TABLE" ] && SUBS_ARN=",\"${T}/${SUBS_TABLE}\""
cat > /tmp/admin-policy.json <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": ["dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem","dynamodb:DeleteItem","dynamodb:Query","dynamodb:Scan"],
      "Resource": ["${T}/${ADMIN_TABLE}","${T}/${USERS_TABLE}","${T}/${TX_TABLE}","${T}/${TX_TABLE}/index/*"${SUBS_ARN}] },
    { "Effect": "Allow",
      "Action": ["cognito-idp:AdminCreateUser","cognito-idp:AdminDisableUser","cognito-idp:AdminEnableUser","cognito-idp:AdminDeleteUser","cognito-idp:ListUsers"],
      "Resource": "arn:aws:cognito-idp:${REGION}:${ACCOUNT}:userpool/${POOL_ID}" },
    { "Effect": "Allow", "Action": ["ses:SendEmail"], "Resource": "*" }
  ]
}
POLICY
aws iam put-role-policy --role-name "$ROLE" --policy-name "mesob-admin-${ENV_NAME}" --policy-document file:///tmp/admin-policy.json
echo "permissions set"

# ---------------------------------------------------------------------------
say "4/8 Lambda ${FN}"
mkdir -p /tmp/mesob-admin && cd /tmp/mesob-admin
cat > index.mjs <<'LAMBDA_EOF'
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
LAMBDA_EOF
rm -f fn.zip && zip -q fn.zip index.mjs
ENVVARS=$(python3 -c "import json,sys; k=['ADMIN_TABLE','USERS_TABLE','USERS_KEY','TX_TABLE','TX_USER_INDEX','SUBS_TABLE','POOL_ID','SES_FROM']; print(json.dumps({'Variables':dict(zip(k,sys.argv[1:]))}))" \
  "$ADMIN_TABLE" "$USERS_TABLE" "$USERS_KEY" "$TX_TABLE" "$TX_USER_INDEX" "$SUBS_TABLE" "$POOL_ID" "$SES_FROM")
if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --zip-file fileb://fn.zip >/dev/null
  aws lambda wait function-updated --function-name "$FN"
  aws lambda update-function-configuration --function-name "$FN" --environment "$ENVVARS" >/dev/null
  aws lambda wait function-updated --function-name "$FN"
  echo "updated"
else
  aws lambda create-function --function-name "$FN" --runtime nodejs20.x --handler index.handler \
    --role "arn:aws:iam::${ACCOUNT}:role/${ROLE}" --zip-file fileb://fn.zip --timeout 20 --memory-size 256 \
    --environment "$ENVVARS" >/dev/null
  aws lambda wait function-active --function-name "$FN"
  echo "created"
fi
aws lambda add-permission --function-name "$FN" --statement-id apigw-admin \
  --action lambda:InvokeFunction --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT}:${API_ID}/*/*/MesobFinancialSystem/*" >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
say "5/8 API routes"
RESOURCES=$(aws apigateway get-resources --rest-api-id "$API_ID" --limit 500 --output json)
rid() { echo "$RESOURCES" | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((i['id'] for i in d['items'] if i['path']==sys.argv[1]),''))" "$1"; }
ensure() { # parent-id path-part full-path
  local id; id=$(rid "$3")
  if [ -z "$id" ]; then
    id=$(aws apigateway create-resource --rest-api-id "$API_ID" --parent-id "$1" --path-part "$2" --query id --output text)
    RESOURCES=$(aws apigateway get-resources --rest-api-id "$API_ID" --limit 500 --output json)
  fi
  echo "$id"
}
URI="arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${REGION}:${ACCOUNT}:function:mesob-admin-\${stageVariables.adminEnv}/invocations"
method() { # resource-id http-method auth(COGNITO|NONE)
  aws apigateway delete-method --rest-api-id "$API_ID" --resource-id "$1" --http-method "$2" >/dev/null 2>&1 || true
  if [ "$3" = "COGNITO" ]; then
    aws apigateway put-method --rest-api-id "$API_ID" --resource-id "$1" --http-method "$2" --authorization-type COGNITO_USER_POOLS --authorizer-id "$AUTHORIZER_ID" >/dev/null
  else
    aws apigateway put-method --rest-api-id "$API_ID" --resource-id "$1" --http-method "$2" --authorization-type NONE >/dev/null
  fi
  aws apigateway put-integration --rest-api-id "$API_ID" --resource-id "$1" --http-method "$2" --type AWS_PROXY --integration-http-method POST --uri "$URI" >/dev/null
}
ROOT=$(rid "/MesobFinancialSystem")
[ -z "$ROOT" ] && { echo "Couldn't find /MesobFinancialSystem in API ${API_ID}"; exit 1; }

R=$(ensure "$ROOT" SiteConfig /MesobFinancialSystem/SiteConfig)
method "$R" GET NONE; method "$R" PUT COGNITO; method "$R" OPTIONS NONE
for NAME in AdminData AdminStaff; do
  R=$(ensure "$ROOT" "$NAME" "/MesobFinancialSystem/${NAME}")
  method "$R" ANY COGNITO; method "$R" OPTIONS NONE
  P=$(ensure "$R" "{proxy+}" "/MesobFinancialSystem/${NAME}/{proxy+}")
  method "$P" ANY COGNITO; method "$P" OPTIONS NONE
done
for NAME in AdminMessages AdminAudit; do
  R=$(ensure "$ROOT" "$NAME" "/MesobFinancialSystem/${NAME}")
  method "$R" ANY COGNITO; method "$R" OPTIONS NONE
done
echo "routes: SiteConfig, AdminData/*, AdminStaff/*, AdminMessages, AdminAudit"

# ---------------------------------------------------------------------------
say "6/8 Deploying to the ${ENV_NAME} stage only"
# Route definitions are shared by both stages; each stage's adminEnv variable
# decides which Lambda (mesob-admin-staging / -production) answers it.
aws apigateway update-stage --rest-api-id "$API_ID" --stage-name "$ENV_NAME" \
  --patch-operations op=replace,path=/variables/adminEnv,value="$ENV_NAME" >/dev/null
DEP=$(aws apigateway create-deployment --rest-api-id "$API_ID" --stage-name "$ENV_NAME" --description "owner console admin routes" --query id --output text)
echo "deployment ${DEP}"

# ---------------------------------------------------------------------------
say "7/8 Smoke test"
BASE="https://${API_ID}.execute-api.${REGION}.amazonaws.com/${ENV_NAME}/MesobFinancialSystem"
# A new deployment answers 403 for a short while before the routes go live.
for i in $(seq 1 12); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/SiteConfig")" = "200" ] && break
  sleep 5
done
echo -n "GET  /SiteConfig (public, expect 200):        "; curl -s -o /dev/null -w '%{http_code}\n' "$BASE/SiteConfig"
echo -n "GET  /AdminData/users without login (expect 401): "; curl -s -o /dev/null -w '%{http_code}\n' "$BASE/AdminData/users"
echo -n "OPTIONS /AdminData/users (CORS, expect 204):   "; curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS "$BASE/AdminData/users"

# ---------------------------------------------------------------------------
say "8/8 Your account"
if [ -n "$OWNER_EMAIL" ]; then
  aws dynamodb scan --table-name "$USERS_TABLE" --filter-expression "email = :e" \
    --expression-attribute-values "{\":e\":{\"S\":\"${OWNER_EMAIL}\"}}" \
    --projection-expression "#k, email, #r" --expression-attribute-names "{\"#k\":\"${USERS_KEY}\",\"#r\":\"role\"}" \
    --query 'Items[0]' --output json
  echo "The console needs role = 0 on this record. If it isn't 0, tell Claude before changing it."
else
  echo "(Pass your login email as the first argument to see your account's role.)"
fi

say "Done — paste everything above back to Claude."
