// Content model for the Site editor: every page of the website and the
// customer-facing app screens, as an ordered list of sections. List-type
// fields are plain text, one item per line, so they stay easy to edit.

export const SECTION_TYPES = {
  hero: {
    label: "Hero",
    fields: [
      ["eyebrow", "Small line above", "text"],
      ["title", "Headline", "text"],
      ["subtitle", "Sub-headline", "textarea"],
      ["primaryText", "Main button", "text"],
      ["primaryLink", "Main button link", "url"],
      ["secondaryText", "Second button", "text"],
      ["secondaryLink", "Second button link", "url"],
      ["image", "Image URL", "url"],
    ],
  },
  features: { label: "Feature grid", fields: [["title", "Heading", "text"], ["items", "Features — one per line: Title | description", "lines"]] },
  pricing: {
    label: "Pricing",
    fields: [
      ["title", "Heading", "text"],
      ["monthly", "Monthly price", "text"],
      ["yearly", "Yearly price", "text"],
      ["note", "Small print", "text"],
      ["bullets", "What's included — one per line", "lines"],
      ["buttonText", "Button", "text"],
    ],
  },
  testimonials: { label: "Testimonials", fields: [["title", "Heading", "text"], ["items", "Quotes — one per line: quote | name, role", "lines"]] },
  faq: { label: "FAQ", fields: [["title", "Heading", "text"], ["items", "Questions — one per line: question | answer", "lines"]] },
  cta: { label: "Call to action", fields: [["title", "Heading", "text"], ["text", "Text", "textarea"], ["buttonText", "Button", "text"], ["buttonLink", "Button link", "url"]] },
  text: { label: "Text block", fields: [["title", "Heading", "text"], ["body", "Text", "textarea"]] },
  stats: { label: "Numbers strip", fields: [["items", "One per line: number | label", "lines"]] },
};

const sec = (type, fields, extra = {}) => ({ id: `${type}-${Math.random().toString(36).slice(2, 8)}`, type, visible: true, fields, ...extra });

export function seedSiteContent() {
  const doc = buildSeed();
  // Give an older version a real copy (different headline) so Restore can be tried.
  const older = JSON.parse(JSON.stringify({ theme: doc.theme, pages: doc.pages }));
  older.pages[0].sections[0].fields.title = "Bookkeeping that drives itself.";
  doc.versions[1].snapshot = older;
  return doc;
}

function buildSeed() {
  const now = Date.now();
  return {
    theme: { brand: "#2563EB", headingFont: "Inter", radius: "rounded", logo: "/thlogo.png" },
    pages: [
      {
        id: "home",
        surface: "website",
        name: "Home",
        path: "/",
        sections: [
          sec("hero", {
            eyebrow: "Bookkeeping for drivers & small business",
            title: "Simple tools. Real growth.",
            subtitle: "Track income, expenses, receipts and mileage in one place — and have tax time ready in minutes.",
            primaryText: "Start free for 30 days",
            primaryLink: "/signup",
            secondaryText: "See how it works",
            secondaryLink: "#features",
            image: "",
          }),
          sec("stats", { items: "12,000+ | receipts scanned\n$1.2M | expenses tracked\n4.8★ | average rating" }),
          sec("features", {
            title: "Everything your accountant asks for",
            items: "Receipt scanning | Snap a photo and the amount, vendor and date fill in.\nMileage tracker | Every business mile logged automatically, IRS rate applied.\nBank & POS sync | Connect your bank or Square and stop typing transactions.\nTax-ready reports | Year-end summary and IFTA in one click.",
          }),
          sec("testimonials", { title: "Drivers love it", items: "I finally know what I actually earn per week. | Hana G., rideshare\nIFTA used to take a weekend. Now it's ten minutes. | Samuel B., trucking" }),
          sec("cta", { title: "Ready when tax season is", text: "30 days free. No card needed.", buttonText: "Create your account", buttonLink: "/signup" }),
        ],
      },
      {
        id: "pricing",
        surface: "website",
        name: "Pricing",
        path: "/pricing",
        sections: [
          sec("pricing", { title: "One plan. Everything included.", monthly: "$24.99/mo", yearly: "$249.99/yr", note: "Save 2 months with yearly. Cancel any time.", bullets: "Unlimited transactions & receipts\nMileage tracker with IRS rate\nBank & Square sync\nYear-end and IFTA reports\nTeammate seats available", buttonText: "Start free trial" }),
          sec("faq", { title: "Billing questions", items: "Is there a free trial? | Yes — 30 days, no card needed.\nCan I cancel any time? | Yes, from Account → Subscription. You keep access until the period ends.\nDo you offer refunds? | Contact support within 14 days of a charge." }),
        ],
      },
      {
        id: "features",
        surface: "website",
        name: "Features",
        path: "/features",
        sections: [
          sec("hero", { eyebrow: "Features", title: "Built for people who drive for a living", subtitle: "Rideshare, delivery, trucking and small shops.", primaryText: "Try it free", primaryLink: "/signup", secondaryText: "", secondaryLink: "", image: "" }),
          sec("features", { title: "What's inside", items: "Smart categories | Expenses sorted the way the IRS wants them.\nMultiple businesses | Keep your food truck and your rideshare apart.\nTeam access | Give your accountant read-only access." }),
        ],
      },
      {
        id: "faq",
        surface: "website",
        name: "FAQ",
        path: "/faq",
        sections: [sec("faq", { title: "Frequently asked questions", items: "Is my data safe? | Yes. It's encrypted and only you can see it.\nDoes it work on my phone? | Yes — on Android today, iPhone soon, and any browser.\nCan my accountant see my books? | Invite them under Team." })],
      },
      {
        id: "app-login",
        surface: "app",
        name: "Sign-in screen",
        path: "/login",
        sections: [sec("hero", { eyebrow: "Welcome back", title: "Sign in to Meksova", subtitle: "Your books, receipts and miles — right where you left them.", primaryText: "Sign in", primaryLink: "", secondaryText: "Create an account", secondaryLink: "/signup", image: "" })],
      },
      {
        id: "app-dashboard",
        surface: "app",
        name: "Dashboard welcome",
        path: "/customer/dashboard",
        sections: [sec("text", { title: "Good morning", body: "Here's your financial overview. Tip: scan today's receipts before they fade." })],
      },
      {
        id: "app-subscribe",
        surface: "app",
        name: "Subscribe screen",
        path: "/customer/subscription",
        sections: [sec("pricing", { title: "Keep everything in one place", monthly: "$24.99/mo", yearly: "$249.99/yr", note: "Your trial data stays with you.", bullets: "Everything in your trial\nPriority support", buttonText: "Subscribe" })],
      },
    ],
    publishedAt: new Date(now - 6 * 86400000).toISOString(),
    publishedBy: "owner@meksova.com",
    versions: [
      { id: "v3", at: new Date(now - 6 * 86400000).toISOString(), by: "owner@meksova.com", note: "Pricing FAQ added" },
      { id: "v2", at: new Date(now - 20 * 86400000).toISOString(), by: "daniel@meksova.com", note: "New hero headline" },
      { id: "v1", at: new Date(now - 60 * 86400000).toISOString(), by: "owner@meksova.com", note: "First version" },
    ],
  };
}

export const newSection = (type) => {
  const fields = {};
  SECTION_TYPES[type].fields.forEach(([k, label]) => {
    fields[k] = k === "title" ? `New ${SECTION_TYPES[type].label.toLowerCase()}` : "";
  });
  return sec(type, fields);
};

export const splitLines = (v) =>
  String(v || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split("|").map((x) => x.trim()));
