/** Capability check for the current session.
 * The account owner (not a teammate) can always do everything. A teammate is
 * limited to the permissions the owner granted (stored at login in teamPerms).
 * Viewing is always allowed; only add/edit/delete are gated. */
export function can(action) {
  try {
    if (localStorage.getItem("isTeamMember") !== "true") return true; // owner
    const p = JSON.parse(localStorage.getItem("teamPerms") || "{}");
    return !!p[action];
  } catch (e) {
    return false;
  }
}
