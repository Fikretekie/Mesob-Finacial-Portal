import React, { useState, useEffect } from "react";
import {
  Dropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
} from "reactstrap";
import { useTranslation } from "react-i18next";
import "../../components/Languageselector/Languageselector.css";

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

  const languages = [
  { code: "en", name: "ENGLISH", short: "EN", flag: "🇺🇸" },
  { code: "am", name: "አማርኛ", short: "አማ", flag: "🇪🇹" },
  { code: "ti", name: "ትግርኛ", short: "ትግ", flag: "🇪🇷" },
  { code: "ar", name: "العربية", short: "AR", flag: "🇸🇦" },
  { code: "es", name: "ESPAÑOL", short: "ES", flag: "🇪🇸" },
  { code: "fr", name: "FRANÇAIS", short: "FR", flag: "🇫🇷" },
  { code: "so", name: "SOOMAALI", short: "SO", flag: "🇸🇴" },
];

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


  const handleLanguageChange = (langCode, e) => {
    // Stop event propagation to prevent toggle from firing
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    setSelectedLanguage(langCode);
    i18n.changeLanguage(langCode);
    localStorage.setItem("selectedLanguage", langCode);
    
    // Force close the dropdown
    setDropdownOpen(false);
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
    onTouchStart={(e) => {
      e.stopPropagation();
      e.preventDefault();  // prevents the click from also firing on mobile
      setDropdownOpen(prev => !prev);
    }}
    style={{
      backgroundColor: "#5e72e4",
      borderColor: "#5e72e4",
      color: "var(--text-1)",
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
          backgroundColor: "#1a273a",
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
            onClick={(e) => handleLanguageChange(lang.code, e)}
            active={selectedLanguage === lang.code}
            style={{
              backgroundColor: selectedLanguage === lang.code ? "#2b427d" : "transparent",
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
                e.currentTarget.style.backgroundColor = "#2d3e50";
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