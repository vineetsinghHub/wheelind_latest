import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

import AdminLayout from "@/components/layout/AdminLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import LiveFleet from "@/pages/LiveFleet";
import Rides from "@/pages/Rides";
import DriversKYC from "@/pages/DriversKYC";
import Riders from "@/pages/Riders";
import FareConfigPage from "@/pages/FareConfig";
import CommissionPasses from "@/pages/CommissionPasses";
import Campaigns from "@/pages/Campaigns";
import WalletLedger from "@/pages/WalletLedger";
import SOSIncidents from "@/pages/SOSIncidents";
import FeatureFlags from "@/pages/FeatureFlags";
import AuditLogs from "@/pages/AuditLogs";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AdminLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/fleet" element={<LiveFleet />} />
          <Route path="/rides" element={<Rides />} />
          <Route path="/drivers" element={<DriversKYC />} />
          <Route path="/riders" element={<Riders />} />
          <Route path="/fares" element={<FareConfigPage />} />
          <Route path="/commissions" element={<CommissionPasses />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/wallet" element={<WalletLedger />} />
          <Route path="/sos" element={<SOSIncidents />} />
          <Route path="/flags" element={<FeatureFlags />} />
          <Route path="/audit" element={<AuditLogs />} />
        </Route>
      </Routes>
      <Toaster position="bottom-right" richColors />
    </>
  );
}
