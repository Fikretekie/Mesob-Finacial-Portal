import axios from "axios";
import { apiUrl, ROUTES } from "config/api";
import { authHeader } from "./apiFetch";

function ownerId() {
  return localStorage.getItem("userId") || "anonymous";
}

/** Team members (accountants / users) for the current account owner.
 * The backend derives the owner from the auth token; returns [] gracefully
 * if the route isn't live yet. */
export async function fetchTeam() {
  try {
    const res = await axios.get(apiUrl(ROUTES.TEAM), {
      params: { userId: ownerId() },
      headers: await authHeader(),
    });
    return Array.isArray(res.data) ? res.data : res.data?.members || [];
  } catch (err) {
    console.warn("fetchTeam failed (team backend may not be live yet):", err?.message);
    return [];
  }
}

/** Add a teammate: creates a real login (email + password) scoped to this
 * owner's account, with a role ("accountant" | "member" | "viewer").
 * Backend provisions the Cognito user + membership record. */
/** Default capabilities for a new teammate (view is always implied). */
export const DEFAULT_PERMS = { add: true, edit: true, delete: false };

export async function inviteTeamMember({ email, role, password, businessIds, subscriptionId, perms }) {
  const res = await axios.post(
    apiUrl(ROUTES.TEAM),
    {
      userId: ownerId(),
      email: (email || "").trim().toLowerCase(),
      role: role || "member",
      password: password || "",
      businessIds: Array.isArray(businessIds) ? businessIds : [],
      subscriptionId: subscriptionId || "",
      perms: perms && typeof perms === "object" ? perms : DEFAULT_PERMS,
    },
    { headers: await authHeader() }
  );
  return res.data;
}

/** The owner's billing status — used to gate paid teammate seats. */
export async function fetchOwnerBilling() {
  try {
    const res = await axios.get(apiUrl(`${ROUTES.USERS}/${ownerId()}`), { headers: await authHeader() });
    const u = res.data?.user || res.data || {};
    return {
      subscription: u.subscription === true || u.subscription === "true",
      isPaid: u.isPaid === true || u.isPaid === "true",
      subscriptionId: u.subscriptionId || "",
      paymentType: (u.paymentType || "").toUpperCase(),
    };
  } catch (err) {
    return { subscription: false, isPaid: false, subscriptionId: "", paymentType: "" };
  }
}

/** Update a teammate's role (and later business access). Owner-only. */
export async function updateTeamMember(memberId, fields) {
  const res = await axios.put(
    apiUrl(`${ROUTES.TEAM}/${encodeURIComponent(memberId)}`),
    { ...fields },
    { headers: await authHeader() }
  );
  return res.data;
}

/** Remove / revoke a teammate by their member id. */
export async function removeTeamMember(memberId) {
  const res = await axios.delete(apiUrl(`${ROUTES.TEAM}/${memberId}`), {
    params: { userId: ownerId() },
    headers: await authHeader(),
  });
  return res.data;
}

/** For the currently signed-in user: if they are a teammate on someone else's
 * account, returns { ownerId, role, email }. For a normal account owner (or
 * when the route isn't live) returns { ownerId: null }. Called at login to
 * decide whose books to show. */
export async function getMyOwner() {
  try {
    const res = await axios.get(apiUrl(`${ROUTES.TEAM}/whoami`), {
      headers: await authHeader(),
    });
    return res.data || { ownerId: null };
  } catch (err) {
    return { ownerId: null };
  }
}

/** Owner-only: recent teammate activity (add/edit/delete) for the account. */
export async function fetchTeamLog() {
  try {
    const res = await axios.get(apiUrl(`${ROUTES.TEAM}/log`), { headers: await authHeader() });
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    return [];
  }
}

export const TEAM_ROLES = [
  { value: "accountant", labelKey: "team.roleAccountant" },
  { value: "member", labelKey: "team.roleMember" },
  { value: "viewer", labelKey: "team.roleViewer" },
];
