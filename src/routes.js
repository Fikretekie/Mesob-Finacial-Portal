import Dashboard from "views/Dashboard.js";
import Users from "views/Users.js";

import Receipts from "views/Receipts";
import UserPage from "views/UserPage";
import CSVReports from "views/CSVReports";
import AdminSubscriptions from "views/Payment/AdminSubscriptions";
import SubscriptionPlans from "views/Payment/SubscriptionPlans";
import MesobFinancial2 from "views/mesobfinancial2";
import Documents from "views/Documents";
import MileageTracker from "views/MileageTracker";
import TripHistory from "views/TripHistory";
import FuelPurchase from "views/FuelPurchase";
import IftaReport from "views/IftaReport";
import Team from "views/Team";
import Connections from "views/Connections";

const adminRoutes = [
  {
    path: "/dashboard",
    name: "Dashboard",
    nameKey: "nav.dashboard",
    icon: "design_app",
    component: <Dashboard />,
    layout: "/admin",
  },
  {
    path: "/users",
    name: "Users",
    nameKey: "nav.users",
    icon: "users_single-02",
    component: <Users />,
    layout: "/admin",
  },
  
  
  {
    path: "/MesobFinancial2",
    name: "Financial Report",
    nameKey: "nav.financialReport",
    icon: "business_money-coins",
    component: <MesobFinancial2 />,
    layout: "/admin",
  },
  {
    path: "/receipts",
    name: "Receipts",
    nameKey: "nav.receipts",
    icon: "files_paper",
    component: <Receipts />,
    layout: "/admin",
  },
  {
    path: "/documents",
    name: "Documents",
    nameKey: "nav.documents",
    icon: "files_box",
    component: <Documents />,
    layout: "/admin",
  },
  {
    path: "/profile",
    name: "Account",
    nameKey: "nav.account",
    icon: "users_single-02",
    component: <UserPage />,
    layout: "/admin",
  },
  {
    path: "/subscriptions",
    name: "Subscriptions",
    nameKey: "nav.subscriptions",
    icon: "business_money-coins",
    component: <AdminSubscriptions />,
    layout: "/admin",
  },
];

// Read businessType/role at CALL time (not module load) so newly-set values
// after login are reflected without a full page reload.
const getCustomerRoutes = () => {
  const userRole = parseInt(localStorage.getItem("role"), 10);
  const userBusinessType = localStorage.getItem("businessType");
  return [
  {
    path: "/dashboard",
    name: "Dashboard",
    nameKey: "nav.dashboard",
    icon: "design_app",
    component: <Dashboard />,
    layout: "/customer",
  },
  {
    path: "/financial-report",
    name: "Financial Report",
    nameKey: "nav.financialReport",
    icon: "business_money-coins",
    component: <MesobFinancial2 />,
    layout: "/customer",
  },
  
  {
    path: "/receipts",
    name: "Receipts",
    nameKey: "nav.receipts",
    icon: "files_paper",
    component: <Receipts />,
    layout: "/customer",
  },
  {
    path: "/documents",
    name: "Documents",
    nameKey: "nav.documents",
    icon: "files_box",
    component: <Documents />,
    layout: "/customer",
  },
  {
    path: "/mileage-tracker",
    name: "Mileage Tracker",
    nameKey: "nav.mileageTracker",
    icon: "location_pin",
    component: <MileageTracker />,
    layout: "/customer",
  },
  {
    path: "/trip-history",
    name: "Trip History",
    nameKey: "nav.tripHistory",
    icon: "location_map-big",
    component: <TripHistory />,
    layout: "/customer",
  },
  ...(userBusinessType === "Trucking"
    ? [
        {
          path: "/fuel-purchase",
          name: "Fuel Purchase",
          nameKey: "nav.fuelPurchase",
          icon: "shopping_cart-simple",
          component: <FuelPurchase />,
          layout: "/customer",
        },
        {
          path: "/ifta-report",
          name: "IFTA Report",
          nameKey: "nav.iftaReport",
          icon: "business_chart-bar-32",
          component: <IftaReport />,
          layout: "/customer",
        },
      ]
    : []),
  {
    path: "/connections",
    name: "Connections",
    nameKey: "nav.connections",
    icon: "ui-1_settings-gear-63",
    component: <Connections />,
    layout: "/customer",
  },
  {
    path: "/team",
    name: "Team",
    nameKey: "nav.team",
    icon: "users_single-02",
    component: <Team />,
    layout: "/customer",
  },
  {
    path: "/profile",
    name: "Account",
    nameKey: "nav.account",
    icon: "users_single-02",
    component: <UserPage />,
    layout: "/customer",
  },
  {
    path: "/csv",
    name: "Backup CSV",
    nameKey: "nav.backupCsv",
    icon: "files_single-copy-04",
    component: <CSVReports />,
    layout: "/customer",
  },
  ...(userRole !== 1 && localStorage.getItem("isTeamMember") !== "true"
    ? [
        {
          path: "/subscription",
          name: "Subscribe",
          nameKey: "nav.subscribe",
          icon: "business_money-coins",
          component: <SubscriptionPlans />,
          layout: "/customer",
          invisible: userRole === 1,
        },
      ]
    : []),
  ];
};

// Backward-compatible static snapshot (evaluated once at import). Prefer
// getCustomerRoutes() in components so post-login businessType/role apply.
const customerRoutes = getCustomerRoutes();

export { adminRoutes, customerRoutes, getCustomerRoutes };
export default adminRoutes;