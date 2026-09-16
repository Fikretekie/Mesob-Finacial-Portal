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

const userRole = parseInt(localStorage.getItem("role"), 10);
const userBusinessType = localStorage.getItem("businessType");

const adminRoutes = [
  {
    path: "/dashboard",
    name: "Dashboard",
    icon: "design_app",
    component: <Dashboard />,
    layout: "/admin",
  },
  {
    path: "/users",
    name: "Users",
    icon: "users_single-02",
    component: <Users />,
    layout: "/admin",
  },
  
  
  {
    path: "/MesobFinancial2",
    name: "Financial Report",
    icon: "business_money-coins",
    component: <MesobFinancial2 />,
    layout: "/admin",
  },
  {
    path: "/receipts",
    name: "Receipts",
    icon: "files_paper",
    component: <Receipts />,
    layout: "/admin",
  },
  {
    path: "/documents",
    name: "Documents",
    icon: "files_box",
    component: <Documents />,
    layout: "/admin",
  },
  {
    path: "/profile",
    name: "Account",
    icon: "users_single-02",
    component: <UserPage />,
    layout: "/admin",
  },
  {
    path: "/subscriptions",
    name: "Subscriptions",
    icon: "business_money-coins",
    component: <AdminSubscriptions />,
    layout: "/admin",
  },
];

const customerRoutes = [
  {
    path: "/dashboard",
    name: "Dashboard",
    icon: "design_app",
    component: <Dashboard />,
    layout: "/customer",
  },
  {
    path: "/financial-report",
    name: "Financial Report",
    icon: "business_money-coins",
    component: <MesobFinancial2 />,
    layout: "/customer",
  },
  
  {
    path: "/receipts",
    name: "Receipts",
    icon: "files_paper",
    component: <Receipts />,
    layout: "/customer",
  },
  {
    path: "/documents",
    name: "Documents",
    icon: "files_box",
    component: <Documents />,
    layout: "/customer",
  },
  {
    path: "/mileage-tracker",
    name: "Mileage Tracker",
    icon: "location_pin",
    component: <MileageTracker />,
    layout: "/customer",
  },
  {
    path: "/trip-history",
    name: "Trip History",
    icon: "location_map-big",
    component: <TripHistory />,
    layout: "/customer",
  },
  ...(userBusinessType === "Trucking"
    ? [
        {
          path: "/fuel-purchase",
          name: "Fuel Purchase",
          icon: "shopping_cart-simple",
          component: <FuelPurchase />,
          layout: "/customer",
        },
        {
          path: "/ifta-report",
          name: "IFTA Report",
          icon: "business_chart-bar-32",
          component: <IftaReport />,
          layout: "/customer",
        },
      ]
    : []),
  {
    path: "/profile",
    name: "Account",
    icon: "users_single-02",
    component: <UserPage />,
    layout: "/customer",
  },
  {
    path: "/csv",
    name: "Backup CSV",
    icon: "files_single-copy-04",
    component: <CSVReports />,
    layout: "/customer",
  },
  ...(userRole !== 1
    ? [
        {
          path: "/subscription",
          name: "Subscribe",
          icon: "business_money-coins",
          component: <SubscriptionPlans />,
          layout: "/customer",
          invisible: userRole === 1,
        },
      ]
    : []),
];

export { adminRoutes, customerRoutes };
export default adminRoutes;