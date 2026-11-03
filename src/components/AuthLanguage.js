import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "components/Languageselector/LanguageSelector";

// Quiet language picker for the sign-in screens: a native <select> styled as
// text, at the bottom of the page. (The navbar's dropdown button competed with
// the sign-in button and pushed the page wider than the phone.)
const AuthLanguage = () => {
  const { i18n } = useTranslation();
  const [lang, setLang] = useState(() => localStorage.getItem("selectedLanguage") || "en");

  useEffect(() => {
    i18n.changeLanguage(lang);
    // eslint-disable-next-line
  }, []);

  const choose = (code) => {
    setLang(code);
    i18n.changeLanguage(code);
    localStorage.setItem("selectedLanguage", code);
  };

  const current = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  return (
    <label className="auth-language">
      <span className="auth-language__icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      </span>
      <span className="auth-language__name">{current.name.charAt(0) + current.name.slice(1).toLowerCase()}</span>
      <svg className="auth-language__chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
      <select aria-label="Language" value={lang} onChange={(e) => choose(e.target.value)}>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name.charAt(0) + l.name.slice(1).toLowerCase()}
          </option>
        ))}
      </select>
    </label>
  );
};

export default AuthLanguage;
