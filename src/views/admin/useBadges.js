import { useEffect, useState } from "react";
import { getData } from "utils/adminData";
import { ticketDue } from "./sla";

/** Counts beside sidebar items. Recounted whenever console data changes. */
export default function useBadges(enabled) {
  const [badges, setBadges] = useState({});
  useEffect(() => {
    if (!enabled) return undefined;
    const count = () =>
      Promise.all([getData("tickets"), getData("requests"), getData("health"), getData("approvals"), getData("slaPolicy"), getData("issues")]).then(([t, r, h, a, sla, is]) => {
        const open = (t.data || []).filter((x) => x.status !== "resolved");
        setBadges({
          support: open.length,
          supportOverdue: open.some((x) => ticketDue(x, sla.data).overdue),
          requests: (r.data || []).filter((x) => x.status === "pending").length,
          health: (h.data?.services || []).filter((x) => x.status !== "ok").length,
          approvals: (a.data || []).filter((x) => x.status === "pending").length,
          issues: (is.data || []).filter((x) => x.status === "new").length,
        });
      });
    count();
    window.addEventListener("oc:data", count);
    return () => window.removeEventListener("oc:data", count);
  }, [enabled]);
  return badges;
}
