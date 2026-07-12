import { Route, Routes } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { JobsProvider } from "@/context/JobsContext";
import DashboardPage from "@/pages/DashboardPage";
import ClipperPage from "@/pages/ClipperPage";
import BeatSyncPage from "@/pages/BeatSyncPage";
import HighlightsPage from "@/pages/HighlightsPage";

export default function App() {
  return (
    <JobsProvider>
      <div className="flex h-screen bg-bg text-text-primary">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 overflow-y-auto px-8 py-8">
            <div className="mx-auto max-w-6xl">
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/clipper" element={<ClipperPage />} />
                <Route path="/beat-sync" element={<BeatSyncPage />} />
                <Route path="/highlights" element={<HighlightsPage />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </JobsProvider>
  );
}
