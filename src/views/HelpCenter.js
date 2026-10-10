import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PanelHeader from "components/PanelHeader/PanelHeader.js";
import "./HelpCenter.css";

// Help content lives here as data with English text inline. Each item is
// rendered through t(`help.*`, <english default>) so it shows in English out of
// the box and switches to any of the 7 locales once their keys are filled in.
// Keep ids stable — the locale files key off them.
const GUIDES = [
  {
    id: "addTransaction",
    q: "How do I record money in or out?",
    a: "Tap “Add Transaction” at the top. Choose the type — Money In for income you received, Money Out for an expense you paid, or Bill for something you owe but haven’t paid yet. Enter the amount, pick the date, add a short note, and Save.",
  },
  {
    id: "scanReceipt",
    q: "How do I scan a receipt?",
    a: "Tap “Scan Receipt” and take a photo. Meksova reads the vendor, total and date for you. Check the details, choose how to record it (expense, goods for resale, or equipment), and Save. The photo stays attached to the transaction.",
  },
  {
    id: "bill",
    q: "How do I record a bill I owe and pay it later?",
    a: "Add a transaction and choose “Bill”. It shows under Total Payable until you pay it. When you pay — fully or in part — open the bill and record the payment; the amount you still owe updates automatically.",
  },
  {
    id: "goods",
    q: "How do I track goods I buy to resell?",
    a: "When adding a purchase, choose “Goods for resale”. Meksova counts it as inventory, not an expense, until you sell it. When you record the sale, the cost of what you sold is deducted as “Cost of items sold”, so your profit stays accurate.",
  },
  {
    id: "equipment",
    q: "How do I record equipment or a vehicle?",
    a: "Add it as a Fixed Asset — for example a truck or a machine. It isn’t an expense; it’s something you own. Meksova can spread its cost over time (depreciation) so your profit reflects the wear each month.",
  },
  {
    id: "mileage",
    q: "How do I track my miles?",
    a: "Open Mileage Tracker and tap Start Trip when you begin driving for business, then Stop when you finish. Save the trip as business or personal. Trip History totals your business miles and estimates your tax deduction.",
  },
  {
    id: "connect",
    q: "How do I connect my bank or Square?",
    a: "Go to Connections. Link your bank with Plaid to review and import transactions, or connect Square to bring in your sales automatically. You stay in control — bank transactions wait for your review before they’re added.",
  },
  {
    id: "readReport",
    q: "How do I read my Financial Report?",
    a: "The Income Statement shows what you earned minus what you spent — your profit. The Balance Sheet shows what you own, what you owe, and what’s left over. The Journal lists every entry. Use the date filters to pick a period.",
  },
  {
    id: "downloadReport",
    q: "How do I download or share a report?",
    a: "Tap “Download Report” on the Dashboard or Financial Report. You get a clean PDF of your summary, income statement and balance sheet that you can save, print, or send to your accountant or bank.",
  },
  {
    id: "currency",
    q: "How do I change my currency?",
    a: "Open Account, tap Edit Profile, and choose your Display Currency. Every screen and report then shows that symbol. This changes how amounts are labeled, not the numbers themselves.",
  },
  {
    id: "team",
    q: "How do I add my team?",
    a: "Open Team and invite a teammate by email. They get their own login to help manage your books. Only you, the owner, can add or remove team members.",
  },
  {
    id: "subscription",
    q: "How do I manage my subscription?",
    a: "Open Subscribe to start or change your plan. Your current plan and the days left in your trial show at the top of the Financial Report.",
  },
];

const GLOSSARY = [
  { id: "revenue", term: "Revenue (Income)", def: "The money your business earns from sales or work, before any costs are taken out." },
  { id: "expense", term: "Expense", def: "Money you spend to run the business — fuel, supplies, advertising, and so on." },
  { id: "cashOnHand", term: "Cash on Hand", def: "The actual money you have right now: everything that came in, minus everything that went out." },
  { id: "moneyInOut", term: "Money In / Money Out", def: "Your cash flow. Money In is cash you received; Money Out is cash you paid. It’s about when money actually moved." },
  { id: "payable", term: "Payable (a bill)", def: "Money you owe but haven’t paid yet, like a bill due later. It counts as an expense now, even before you pay it." },
  { id: "netIncome", term: "Net Income (Profit)", def: "What’s left after you subtract all expenses from your revenue. Positive means a profit; negative means a loss." },
  { id: "estimatedTax", term: "Estimated Tax", def: "A rough amount to set aside for taxes — about 30% of your profit. It’s a guide to help you save, not an exact tax bill." },
  { id: "depreciation", term: "Depreciation", def: "Spreading the cost of something big you own (like a truck) across the years you use it, instead of counting it all in one month." },
  { id: "fixedAsset", term: "Fixed Asset", def: "Something valuable you own and use for a long time — a vehicle, equipment, a machine. It’s part of what your business owns, not an expense." },
  { id: "inventory", term: "Inventory", def: "Goods you bought to resell but haven’t sold yet. It counts as something you own until it’s sold." },
  { id: "cogs", term: "Cost of Items Sold (COGS)", def: "What the goods you sold originally cost you. It’s subtracted from the sale so your profit on it is accurate." },
  { id: "grossProfit", term: "Gross Profit", def: "Your sales minus the cost of the goods you sold — before other running expenses." },
  { id: "accrualVsCash", term: "Accrual vs Cash", def: "Cash basis counts money only when it moves. Accrual counts income when you earn it and expenses when you owe them, even before cash changes hands." },
  { id: "assetsLiabEquity", term: "Assets, Liabilities & Equity", def: "Assets are what you own. Liabilities are what you owe. Equity is what’s left for you after debts. Assets always equal Liabilities plus Equity." },
  { id: "balanceSheet", term: "Balance Sheet", def: "A snapshot of what you own, what you owe, and what’s left over, at a point in time." },
  { id: "incomeStatement", term: "Income Statement", def: "A summary of your revenue, costs and expenses over a period, ending in your profit or loss." },
];

const SOCIALS = [
  { href: "https://www.facebook.com/profile.php?id=61579534023491", label: "Facebook", icon: "fab fa-facebook", color: "#1877F2" },
  { href: "https://www.tiktok.com/@mesob85", label: "TikTok", icon: "fab fa-tiktok", color: "var(--text-1)" },
  { href: "https://www.instagram.com/mesobfinancial", label: "Instagram", icon: "fab fa-instagram", color: "#E4405F" },
];

const Chevron = ({ open }) => (
  <svg className={`hc-chevron${open ? " is-open" : ""}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

function HelpCenter() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);

  const q = query.trim().toLowerCase();

  // Translated, then filtered by the search box (matches question/answer or term/definition).
  const guides = useMemo(
    () =>
      GUIDES.map((g) => ({
        id: g.id,
        title: t(`help.guides.${g.id}.q`, g.q),
        body: t(`help.guides.${g.id}.a`, g.a),
      })).filter((g) => !q || g.title.toLowerCase().includes(q) || g.body.toLowerCase().includes(q)),
    [t, q]
  );

  const glossary = useMemo(
    () =>
      GLOSSARY.map((g) => ({
        id: g.id,
        title: t(`help.glossary.${g.id}.term`, g.term),
        body: t(`help.glossary.${g.id}.def`, g.def),
      })).filter((g) => !q || g.title.toLowerCase().includes(q) || g.body.toLowerCase().includes(q)),
    [t, q]
  );

  const toggle = (id) => setOpenId((cur) => (cur === id ? null : id));

  const renderAccordion = (items, prefix) =>
    items.map((it) => {
      const key = `${prefix}-${it.id}`;
      const open = openId === key;
      return (
        <div className={`hc-item${open ? " is-open" : ""}`} key={key}>
          <button
            type="button"
            className="hc-q"
            aria-expanded={open}
            onClick={() => toggle(key)}
          >
            <span>{it.title}</span>
            <Chevron open={open} />
          </button>
          {open && <div className="hc-a">{it.body}</div>}
        </div>
      );
    });

  const noResults = q && guides.length === 0 && glossary.length === 0;

  return (
    <>
      <PanelHeader size="sm" />
      <div className="content hc-wrap">
        <div className="hc-hero">
          <h2 className="hc-title">{t("help.title", "Help & Support")}</h2>
          <p className="hc-subtitle">
            {t("help.subtitle", "Simple answers on how to use Meksova and what the money words mean.")}
          </p>
          <div className="hc-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("help.searchPlaceholder", "Search help…")}
              aria-label={t("help.searchPlaceholder", "Search help…")}
            />
          </div>
        </div>

        {noResults && (
          <div className="hc-empty">
            {t("help.noResults", "No results. Try a different word, or contact us below.")}
          </div>
        )}

        {guides.length > 0 && (
          <section className="hc-section">
            <h3 className="hc-section-title">{t("help.guidesTitle", "Using the app")}</h3>
            <div className="hc-list">{renderAccordion(guides, "g")}</div>
          </section>
        )}

        {glossary.length > 0 && (
          <section className="hc-section">
            <h3 className="hc-section-title">{t("help.glossaryTitle", "What the words mean")}</h3>
            <div className="hc-list">{renderAccordion(glossary, "t")}</div>
          </section>
        )}

        <section className="hc-section">
          <h3 className="hc-section-title">{t("help.contactTitle", "Still need help?")}</h3>
          <p className="hc-contact-intro">
            {t("help.contactIntro", "Reach a real person — we’re happy to help.")}
          </p>
          <div className="hc-contact-grid">
            <a className="hc-contact-card" href="tel:+16149665005">
              <span className="hc-contact-ico hc-contact-ico--phone">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
              </span>
              <span className="hc-contact-main">
                <span className="hc-contact-label">{t("help.phone", "Phone")}</span>
                <span className="hc-contact-value">+1 (614) 966-5005</span>
              </span>
            </a>
            <a className="hc-contact-card" href="mailto:info@meksova.com">
              <span className="hc-contact-ico hc-contact-ico--email">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>
              </span>
              <span className="hc-contact-main">
                <span className="hc-contact-label">{t("help.email", "Email")}</span>
                <span className="hc-contact-value">info@meksova.com</span>
              </span>
            </a>
          </div>
          <p className="hc-follow-label">{t("help.followUs", "Follow us")}</p>
          <div className="hc-socials">
            {SOCIALS.map((s) => (
              <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} style={{ color: s.color }}>
                <i className={s.icon} />
              </a>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export default HelpCenter;
