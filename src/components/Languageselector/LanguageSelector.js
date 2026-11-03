import React, { useState, useEffect } from "react";
import {
  Dropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
} from "reactstrap";
import { useTranslation } from "react-i18next";
import "../../components/Languageselector/Languageselector.css";

export const LANGUAGES = [
  { code: "en", name: "ENGLISH", short: "EN", flag: "🇺🇸" },
  { code: "am", name: "አማርኛ", short: "አማ", flag: "🇪🇹" },
  { code: "ti", name: "ትግርኛ", short: "ትግ", flag: "🇪🇷" },
  { code: "ar", name: "العربية", short: "AR", flag: "🇸🇦" },
  { code: "es", name: "ESPAÑOL", short: "ES", flag: "🇪🇸" },
  { code: "fr", name: "FRANÇAIS", short: "FR", flag: "🇫🇷" },
  { code: "so", name: "SOOMAALI", short: "SO", flag: "🇸🇴" },
];

const LanguageSelector = () => {
  const { i18n } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("en");

  // const languages = [
  //   { code: "en", name: "ENGLISH", flag: "🇺🇸" },
  //   { code: "am", name: "አማርኛ", flag: "🇪🇹" },
  //   { code: "ti", name: "ትግርኛ", flag: "🇪🇷" },
  //   { code: "ar", name: "العربية", flag: "🇸🇦" },
  //   { code: "es", name: "ESPAÑOL", flag: "🇪🇸" },
  //   { code: "fr", name: "FRANÇAIS", flag: "🇫🇷" },
  //   { code: "so", name: "SOOMAALI", flag: "🇸🇴" },
  // ];

  const languages = LANGUAGES;

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

useEffect(() => {
  const handleResize = () => setIsMobile(window.innerWidth < 768);
  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
}, []);

  useEffect(() => {
    const savedLanguage = localStorage.getItem("selectedLanguage") || "en";
    setSelectedLanguage(savedLanguage);
    i18n.changeLanguage(savedLanguage);
  }, [i18n]);

// const toggle = (e) => {
//   console.log("🔵 toggle fired", e?.type);
//   if (e) {
//     e.stopPropagation();
//     e.preventDefault();
//   }
//   setDropdownOpen(prev => !prev);
// };

const toggle = () => setDropdownOpen(prev => !prev);


  // DropdownItem closes the menu itself (it calls the Dropdown's toggle);
  // closing it here as well made the two toggles cancel out and the menu
  // stayed open after picking a language.
  const handleLanguageChange = (langCode) => {
    setSelectedLanguage(langCode);
    i18n.changeLanguage(langCode);
    localStorage.setItem("selectedLanguage", langCode);
  };

  const currentLanguage =
    languages.find((lang) => lang.code === selectedLanguage) || languages[0];


return (
  <div className="language-selector-wrapper" >
    <Dropdown isOpen={dropdownOpen} toggle={toggle}>
<DropdownToggle
    caret
    className="language-toggle"
    tag="button"
    style={{
      backgroundColor: "var(--accent-solid)",
      borderColor: "var(--accent-solid)",
      color: "var(--accent-ink)",
      padding: isMobile ? "6px 10px" : "2px 14px",
      borderRadius: "6px",
      fontSize: isMobile ? "12px" : "13px",
      fontWeight: "500",
      display: "flex",
      alignItems: "center",
      gap: "5px",
      whiteSpace: "nowrap",
      cursor: "pointer",
      touchAction: "manipulation",
      WebkitTapHighlightColor: "transparent",
      userSelect: "none",
      WebkitUserSelect: "none",
    }}
  >
    <span>{currentLanguage.flag}</span>
    <span>{isMobile ? currentLanguage.short : currentLanguage.name}</span>
  </DropdownToggle>
      <DropdownMenu
        container="body"
        strategy="fixed"
        style={{
          backgroundColor: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "6px",
          marginTop: "6px",
          minWidth: "200px",
          maxHeight: "320px",
          overflowY: "auto",
          zIndex: 9999,
        }}
      >
        {languages.map((lang) => (
          <DropdownItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            active={selectedLanguage === lang.code}
            style={{
              backgroundColor: selectedLanguage === lang.code ? "var(--accent-soft)" : "transparent",
              color: "var(--text-1)",
              padding: "10px 16px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontSize: "14px",
            }}
            onMouseEnter={(e) => {
              if (selectedLanguage !== lang.code)
                e.currentTarget.style.backgroundColor = "var(--surface-hover)";
            }}
            onMouseLeave={(e) => {
              if (selectedLanguage !== lang.code)
                e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <span style={{ fontSize: "18px" }}>{lang.flag}</span>
            <span>{lang.name}</span>
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  </div>
);
};

export default LanguageSelector;