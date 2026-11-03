import { getMilesByState } from "utils/tripStorage";
import { getGallonsByState } from "utils/fuelStorage";

// IFTA quarterly figures, laid out the way the return asks for them: per
// jurisdiction total / taxable miles, taxable gallons (miles ÷ fleet MPG),
// tax-paid gallons (bought there) and net taxable gallons. Miles and gallons
// are whole numbers and MPG has two decimals, as on the return. Tax rates
// change every quarter and the base state's portal applies them, so no
// rates or amounts due are computed here.

const QUARTER_MONTHS = { 1: "Jan 1 – Mar 31", 2: "Apr 1 – Jun 30", 3: "Jul 1 – Sep 30", 4: "Oct 1 – Dec 31" };

export const quarterRange = (year, quarter) => `${QUARTER_MONTHS[quarter]}, ${year}`;

/** trips / fuel: already filtered to the quarter. */
export function buildIfta(trips, fuel) {
  const milesByState = getMilesByState(trips);
  const gallonsByState = getGallonsByState(fuel);
  const states = Array.from(new Set([...Object.keys(milesByState), ...Object.keys(gallonsByState)]));

  const base = states.map((state) => ({
    state,
    miles: Math.round(milesByState[state] || 0),
    paidGallons: Math.round(gallonsByState[state] || 0),
  }));
  const totalMiles = base.reduce((s, r) => s + r.miles, 0);
  const totalGallons = base.reduce((s, r) => s + r.paidGallons, 0);
  const mpg = totalGallons > 0 ? Math.round((totalMiles / totalGallons) * 100) / 100 : null;

  const rows = base
    .map((r) => {
      const taxableGallons = mpg ? Math.round(r.miles / mpg) : null;
      return {
        ...r,
        taxableMiles: r.miles,
        taxableGallons,
        netGallons: taxableGallons === null ? null : taxableGallons - r.paidGallons,
      };
    })
    .sort((a, b) => b.miles - a.miles || a.state.localeCompare(b.state));

  // Trips saved without a state split (e.g. before GPS state detection) can't go in the table.
  const unassigned = trips.filter(
    (t) => (!Array.isArray(t.stateBreakdown) || t.stateBreakdown.length === 0) && Number(t.miles || 0) >= 0.05
  );

  return {
    rows,
    totalMiles,
    totalGallons,
    mpg,
    totalTaxableGallons: mpg ? rows.reduce((s, r) => s + r.taxableGallons, 0) : null,
    totalNetGallons: mpg ? rows.reduce((s, r) => s + r.netGallons, 0) : null,
    unassignedTrips: unassigned.length,
    unassignedMiles: unassigned.reduce((s, t) => s + Number(t.miles || 0), 0),
  };
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function iftaCsv(report, { year, quarter, carrier }) {
  const lines = [
    ["IFTA Quarterly Summary", `Q${quarter} ${year}`, quarterRange(year, quarter)],
    ["Carrier", carrier.name || ""],
    ["IFTA account", carrier.account || ""],
    ["Base jurisdiction", carrier.base || ""],
    ["Fleet MPG", report.mpg === null ? "" : report.mpg.toFixed(2)],
    [],
    ["Jurisdiction", "Total Miles", "Taxable Miles", "Taxable Gallons", "Tax-Paid Gallons", "Net Taxable Gallons"],
    ...report.rows.map((r) => [r.state, r.miles, r.taxableMiles, r.taxableGallons, r.paidGallons, r.netGallons]),
    ["Total", report.totalMiles, report.totalMiles, report.totalTaxableGallons, report.totalGallons, report.totalNetGallons],
  ];
  return lines.map((l) => l.map(csvCell).join(",")).join("\n") + "\n";
}

const fmtInt = (n) => (n === null || n === undefined ? "—" : Math.round(n).toLocaleString("en-US"));
const fmtMoney = (n, digits = 2) => (Number.isFinite(Number(n)) ? `$${Number(n).toFixed(digits)}` : "—");

/** The quarterly summary + trip and fuel logs, as a jsPDF document (loaded on demand). */
export async function iftaPdf(report, { year, quarter, carrier, trips, fuel }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const NAVY = [16, 25, 38];
  const BLUE = [43, 66, 125];
  const prepared = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  // Header band.
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("IFTA Quarterly Summary", M, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(200, 205, 215);
  doc.text(`Q${quarter} ${year}  ·  ${quarterRange(year, quarter)}`, M, 22);
  doc.text(`Prepared ${prepared}`, W - M, 22, { align: "right" });

  // Carrier block.
  let y = 40;
  const field = (label, value, x) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 115, 125);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 24, 32);
    doc.text(value || "—", x, y + 6, { maxWidth: 70 });
  };
  field("Carrier", carrier.name, M);
  field("IFTA account no.", carrier.account, M + 78);
  field("Base jurisdiction", carrier.base, M + 136);

  // Figures that drive the whole return.
  y = 58;
  const stat = (label, value, x) => {
    doc.setDrawColor(220, 224, 230);
    doc.setFillColor(246, 247, 249);
    doc.roundedRect(x, y, 58, 18, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 115, 125);
    doc.text(label.toUpperCase(), x + 4, y + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20, 24, 32);
    doc.text(value, x + 4, y + 14);
  };
  stat("Total miles", fmtInt(report.totalMiles), M);
  stat("Total gallons", fmtInt(report.totalGallons), M + 62);
  stat("Fleet MPG", report.mpg === null ? "—" : report.mpg.toFixed(2), M + 124);

  autoTable(doc, {
    startY: 84,
    margin: { left: M, right: M },
    head: [["Jurisdiction", "Total miles", "Taxable miles", "Taxable gallons", "Tax-paid gallons", "Net taxable gallons"]],
    body: report.rows.map((r) => [r.state, fmtInt(r.miles), fmtInt(r.taxableMiles), fmtInt(r.taxableGallons), fmtInt(r.paidGallons), fmtInt(r.netGallons)]),
    foot: [["Total", fmtInt(report.totalMiles), fmtInt(report.totalMiles), fmtInt(report.totalTaxableGallons), fmtInt(report.totalGallons), fmtInt(report.totalNetGallons)]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.4, lineColor: [225, 228, 233], textColor: [20, 24, 32] },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: "bold", halign: "right" },
    footStyles: { fillColor: [236, 239, 244], textColor: [20, 24, 32], fontStyle: "bold", halign: "right" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    didParseCell: (d) => {
      if ((d.section === "head" || d.section === "foot") && d.column.index === 0) d.cell.styles.halign = "left";
    },
  });

  // How to read it.
  y = doc.lastAutoTable.finalY + 8;
  const notes = [
    "Taxable gallons = taxable miles ÷ fleet MPG. Net taxable gallons = taxable gallons - tax-paid gallons; a negative number is a credit.",
    "Taxable miles equal total miles: no tax-exempt miles (e.g. toll roads) are recorded. Adjust on the return if some of your miles are exempt.",
    "Tax rates change every quarter, so this summary shows no rates or amounts due — your base jurisdiction's filing portal calculates them from these figures.",
    "Miles and gallons are rounded to whole numbers and MPG to two decimals, as on the return.",
  ];
  if (report.mpg === null) notes.unshift("No fuel purchases are recorded for this quarter, so fleet MPG and taxable gallons can't be calculated yet.");
  if (report.unassignedTrips > 0) {
    notes.unshift(
      `${report.unassignedTrips} trip(s) totalling ${report.unassignedMiles.toFixed(1)} miles have no state breakdown and are not included above. Add their miles to the right jurisdictions before filing.`
    );
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 86, 96);
  notes.forEach((n) => {
    const lines = doc.splitTextToSize(`•  ${n}`, W - 2 * M);
    if (y + lines.length * 4 > H - 18) {
      doc.addPage();
      y = 20;
    }
    doc.text(lines, M, y);
    y += lines.length * 4 + 1.5;
  });

  const section = (title) => {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20, 24, 32);
    doc.text(title, M, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 115, 125);
    doc.text(`Q${quarter} ${year} · supporting records (keep 4 years for IFTA audits)`, M, 24);
  };

  // Trip log: the distance records behind every mile above.
  section("Trip log");
  const sortedTrips = [...trips].sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
  autoTable(doc, {
    startY: 30,
    margin: { left: M, right: M },
    head: [["Date", "Purpose", "Miles", "Miles by jurisdiction"]],
    body: sortedTrips.map((t) => [
      t.dateKey,
      t.type === "personal" ? "Personal" : t.purpose || "Business",
      Number(t.miles || 0).toFixed(1),
      Array.isArray(t.stateBreakdown) && t.stateBreakdown.length
        ? t.stateBreakdown.map((s) => `${s.state} ${Number(s.miles).toFixed(1)}`).join(", ")
        : "No state data",
    ]),
    theme: "striped",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2, textColor: [20, 24, 32] },
    headStyles: { fillColor: BLUE, textColor: 255 },
    columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 40 }, 2: { cellWidth: 20, halign: "right" } },
    didParseCell: (d) => {
      if (d.section === "head" && d.column.index === 2) d.cell.styles.halign = "right";
    },
  });

  // Fuel log: the tax-paid gallons.
  section("Fuel purchase log");
  const sortedFuel = [...fuel].sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
  autoTable(doc, {
    startY: 30,
    margin: { left: M, right: M },
    head: [["Date", "Jurisdiction", "Gallons", "Price / gal", "Total cost"]],
    body: sortedFuel.length
      ? sortedFuel.map((f) => [f.dateKey, f.state || "—", Number(f.gallons || 0).toFixed(3), fmtMoney(f.pricePerGallon, 3), fmtMoney(f.totalCost)])
      : [[{ content: "No fuel purchases recorded this quarter.", colSpan: 5 }]],
    theme: "striped",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2, textColor: [20, 24, 32] },
    headStyles: { fillColor: BLUE, textColor: 255 },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    didParseCell: (d) => {
      if (d.section === "head" && d.column.index >= 2) d.cell.styles.halign = "right";
    },
  });

  // Footer on every page.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(225, 228, 233);
    doc.line(M, H - 12, W - M, H - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 125, 135);
    doc.text(`${carrier.name || "Carrier"} · IFTA Q${quarter} ${year} · Prepared with Meksova`, M, H - 7);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 7, { align: "right" });
  }
  return doc;
}
