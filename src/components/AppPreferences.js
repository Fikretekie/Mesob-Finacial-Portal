import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Modal } from "reactstrap";
import { signOut } from "aws-amplify/auth";
import { LANGUAGES } from "components/Languageselector/LanguageSelector";
import AppLockSetting from "components/AppLockSetting";
import DriveSettings from "components/DriveSettings";
import { clearOfflineData } from "utils/offline";
import { getThemePref, setThemePref } from "utils/theme";
import { stopDriveDetection } from "utils/driveMonitor";
import { clearForSignOut } from "utils/authStorage";

// Phone-app settings group at the top of Account. Language and theme live
// here (not in the top bar, which is reserved for the page title) — the
// standard place a banking app keeps them.
const AppPreferences = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(getThemePref);
  const [lang, setLang] = useState(
    () => localStorage.getItem("selectedLanguage") || i18n.language || "en"
  );
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const chooseTheme = (next) => {
    setThemePref(next);
    setTheme(next);
  };

  // Native <select>: Android shows its own picker sheet, which is sturdier on
  // touch than a positioned dropdown menu.
  const chooseLanguage = (code) => {
    setLang(code);
    i18n.changeLanguage(code);
    localStorage.setItem("selectedLanguage", code);
  };

  const handleSignOut = async () => {
    await clearOfflineData();
    await stopDriveDetection();
    clearForSignOut();
    try {
      await signOut();
    } catch (e) {
      // Native Google/Apple sessions have no Amplify session to end.
    }
    navigate("/login", { replace: true });
  };

  return (
    <section className="mksv-prefs" aria-labelledby="mksv-prefs-title">
      <h2 id="mksv-prefs-title" className="mksv-prefs__title">{t("app.prefsTitle")}</h2>
      <div className="mksv-prefs__group">
        <label className="mksv-prefs__row" htmlFor="mksv-prefs-lang">
          <span className="mksv-prefs__label">{t("app.prefsLanguage")}</span>
          <span className="mksv-select">
            <select id="mksv-prefs-lang" value={lang} onChange={(e) => chooseLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </label>
        <div className="mksv-prefs__row">
          <span id="mksv-prefs-theme" className="mksv-prefs__label">{t("app.prefsAppearance")}</span>
          <div className="mksv-segmented" role="radiogroup" aria-labelledby="mksv-prefs-theme">
            {["system", "dark", "light"].map((opt) => (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={theme === opt}
                className={`mksv-segmented__opt${theme === opt ? " is-on" : ""}`}
                onClick={() => chooseTheme(opt)}
              >
                {opt === "system" ? t("app.prefsSystem") : opt === "dark" ? t("app.prefsDark") : t("app.prefsLight")}
              </button>
            ))}
          </div>
        </div>
      </div>
      <AppLockSetting />
      <DriveSettings />
      <button type="button" className="mksv-prefs__signout" onClick={() => setConfirmSignOut(true)}>
        {t("navbar.logout")}
      </button>

      <Modal
        isOpen={confirmSignOut}
        toggle={() => setConfirmSignOut(false)}
        labelledBy="mksv-signout-title"
        className="mksv-confirm-sheet"
      >
        <div className="mksv-confirm">
          <h2 id="mksv-signout-title" className="mksv-sheet__title">{t("app.signOutTitle")}</h2>
          <p className="mksv-confirm__body">{t("app.signOutBody")}</p>
          <button type="button" className="mksv-app-btn mksv-app-btn--danger" onClick={handleSignOut}>
            {t("navbar.logout")}
          </button>
          <button type="button" className="mksv-app-btn mksv-app-btn--ghost" onClick={() => setConfirmSignOut(false)}>
            {t("app.cancel")}
          </button>
        </div>
      </Modal>
    </section>
  );
};

export default AppPreferences;
