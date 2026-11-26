import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { NewContract } from "./pages/NewContract";
import { ContractDetail } from "./pages/ContractDetail";
import { Templates } from "./pages/Templates";

const navLink = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition-colors ${isActive ? "text-blue-600" : "text-gray-600 hover:text-gray-900"}`;

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between">
          <span className="text-lg font-semibold text-gray-900">Living High · Contracts</span>
          <div className="flex gap-6">
            <NavLink to="/contracts" className={navLink}>Contracts</NavLink>
            <NavLink to="/templates" className={navLink}>Templates</NavLink>
          </div>
        </nav>
        <Routes>
          <Route path="/" element={<Navigate to="/contracts" replace />} />
          <Route path="/contracts" element={<Dashboard />} />
          <Route path="/contracts/new" element={<NewContract />} />
          <Route path="/contracts/:id" element={<ContractDetail />} />
          <Route path="/templates" element={<Templates />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
