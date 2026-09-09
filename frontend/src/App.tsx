import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

// Admin console — staff only, namespaced under /admin.
import AdminLayout from "@/components/layout/AdminLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import LiveFleet from "@/pages/LiveFleet";
import Rides from "@/pages/Rides";
import DispatchLab from "@/pages/DispatchLab";
import DriversKYC from "@/pages/DriversKYC";
import Riders from "@/pages/Riders";
import FareConfigPage from "@/pages/FareConfig";
import CommissionPasses from "@/pages/CommissionPasses";
import Campaigns from "@/pages/Campaigns";
import WalletLedger from "@/pages/WalletLedger";
import SOSIncidents from "@/pages/SOSIncidents";
import FeatureFlags from "@/pages/FeatureFlags";
import AuditLogs from "@/pages/AuditLogs";

// Rider app — the public consumer product at the root.
import RiderLayout from "@/rider/RiderLayout";
import RiderWelcome from "@/rider/pages/RiderWelcome";
import RiderBook from "@/rider/pages/RiderBook";
import RiderTrip from "@/rider/pages/RiderTrip";
import RiderTrips from "@/rider/pages/RiderTrips";
import RiderWalletPage from "@/rider/pages/RiderWalletPage";

export default function App() {
  return (
    <>
      <Routes>
        {/* Rider app */}
        <Route path="/welcome" element={<RiderWelcome />} />
        <Route element={<RiderLayout />}>
          <Route path="/" element={<RiderBook />} />
          <Route path="/trip/:rideId" element={<RiderTrip />} />
          <Route path="/trips" element={<RiderTrips />} />
          <Route path="/wallet" element={<RiderWalletPage />} />
        </Route>

        {/* Admin console */}
        <Route path="/admin/login" element={<Login />} />
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Dashboard />} />
          <Route path="/admin/fleet" element={<LiveFleet />} />
          <Route path="/admin/rides" element={<Rides />} />
          <Route path="/admin/dispatch" element={<DispatchLab />} />
          <Route path="/admin/drivers" element={<DriversKYC />} />
          <Route path="/admin/riders" element={<Riders />} />
          <Route path="/admin/fares" element={<FareConfigPage />} />
          <Route path="/admin/commissions" element={<CommissionPasses />} />
          <Route path="/admin/campaigns" element={<Campaigns />} />
          <Route path="/admin/wallet" element={<WalletLedger />} />
          <Route path="/admin/sos" element={<SOSIncidents />} />
          <Route path="/admin/flags" element={<FeatureFlags />} />
          <Route path="/admin/audit" element={<AuditLogs />} />
        </Route>
      </Routes>
      {/* top-center keeps toasts clear of the admin sign-out control (top-right)
          and the rider app's bottom tab bar */}
      <Toaster position="top-center" richColors />
    </>
  );
}
