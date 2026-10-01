import axios from "axios";
import { apiUrl, ROUTES } from "config/api";

function ownerId() {
  return localStorage.getItem("userId") || "anonymous";
}

/** Team members (accountants / users) for the current account owner.
 * Returns [] gracefully if the backend route isn't live yet. */
export async function fetchTeam() {
  try {
    const res = await axios.get(apiUrl(ROUTES.TEAM), { params: { userId: ownerId() } });
    return Array.isArray(res.data) ? res.data : res.data?.members || [];
  } catch (err) {
    console.warn("fetchTeam failed (team backend may not be live yet):", err?.message);
    return [];
  }
}

/** Add a teammate: creates a real login (email + password) scoped to this
 * owner's account, with a role ("accountant" | "member" | "viewer").
 * Backend provisions the Cognito user + membership record. */
export async function inviteTeamMember({ email, role, password }) {
  const res = await axios.post(apiUrl(ROUTES.TEAM), {
    userId: ownerId(),
    email: (email || "").trim().toLowerCase(),
    role: role || "member",
    password: password || "",
  });
  return res.data;
}

/** Remove / revoke a teammate by their member id. */
export async function removeTeamMember(memberId) {
  const res = await axios.delete(apiUrl(`${ROUTES.TEAM}/${memberId}`), {
    params: { userId: ownerId() },
  });
  return res.data;
}

export const TEAM_ROLES = [
  { value: "accountant", labelKey: "team.roleAccountant" },
  { value: "member", labelKey: "team.roleMember" },
  { value: "viewer", labelKey: "team.roleViewer" },
];
