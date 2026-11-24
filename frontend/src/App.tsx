import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { NewContract } from "./pages/NewContract";
import { ContractDetail } from "./pages/ContractDetail";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="border-b border-gray-200 bg-white px-6 py-4">
          <a href="/contracts" className="text-lg font-semibold text-gray-900">
            Living High · Contracts
          </a>
        </nav>
        <Routes>
          <Route path="/" element={<Navigate to="/contracts" replace />} />
          <Route path="/contracts" element={<Dashboard />} />
          <Route path="/contracts/new" element={<NewContract />} />
          <Route path="/contracts/:id" element={<ContractDetail />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
