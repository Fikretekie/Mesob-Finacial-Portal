import React from "react";

// Grey placeholder rows shown while a list loads — reads as "almost there"
// instead of a spinner on an empty screen.
const AppListSkeleton = ({ rows = 4 }) => (
  <ul className="mksv-list mksv-skeleton" aria-hidden="true">
    {Array.from({ length: rows }, (_, i) => (
      <li key={i} className="mksv-row mksv-row--skeleton">
        <span className="mksv-row__icon mksv-skel" />
        <span className="mksv-row__body">
          <span className="mksv-skel mksv-skel--line" style={{ "--w": `${60 - (i % 3) * 12}%` }} />
          <span className="mksv-skel mksv-skel--line mksv-skel--sub" />
        </span>
        <span className="mksv-skel mksv-skel--amt" />
      </li>
    ))}
  </ul>
);

export default AppListSkeleton;
