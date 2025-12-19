import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { bakeryStore } from './src/models/BakeryStore';
import { ShiftStatus } from './types';
import { Login } from './src/components/Login';
import { Dashboard } from './src/components/Dashboard';
import { ProductionPanel } from './src/components/ProductionPanel';
import { SalesPos } from './src/components/SalesPos';
import { InventoryManager } from './src/components/InventoryManager';
import { InventorySheet } from './src/components/InventorySheet';
import { generateShiftReport } from './services/pdfReport';

// Hook to subscribe to store updates
const useBakeryStore = () => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    return bakeryStore.subscribe(() => setTick(t => t + 1));
  }, []);
  return bakeryStore;
};

const App: React.FC = () => {
  const store = useBakeryStore();
  const { isAuthenticated, shift } = store;
  const [activeTab, setActiveTab] = useState<'dashboard' | 'production' | 'sales' | 'inventory' | 'sheet'>('dashboard');

  if (!isAuthenticated) {
    return <Login store={store} />;
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#fdfaf5]">
      {/* Sidebar Navigation */}
      <nav className="w-full md:w-64 bg-stone-900 text-white flex flex-col flex-shrink-0 relative">
        <div className="p-6">
          <h1 className="text-xl font-serif italic text-amber-200">NiksBakerySystem</h1>
          <p className="text-stone-400 text-[10px] uppercase tracking-tighter mt-1 font-bold">Premium Management</p>
        </div>

        <div className="flex-1 px-4 space-y-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${activeTab === 'dashboard' ? 'bg-amber-800 text-white' : 'text-stone-400 hover:bg-stone-800'}`}
          >
            <i className="fas fa-chart-line w-5"></i>
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => setActiveTab('production')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${activeTab === 'production' ? 'bg-amber-800 text-white' : 'text-stone-400 hover:bg-stone-800'}`}
          >
            <i className="fas fa-mitten w-5"></i>
            <span>Production</span>
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${activeTab === 'sales' ? 'bg-amber-800 text-white' : 'text-stone-400 hover:bg-stone-800'}`}
          >
            <i className="fas fa-cash-register w-5"></i>
            <span>Sales Entry</span>
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${activeTab === 'inventory' ? 'bg-amber-800 text-white' : 'text-stone-400 hover:bg-stone-800'}`}
          >
            <i className="fas fa-boxes w-5"></i>
            <span>Items Library</span>
          </button>
          <button
            onClick={() => setActiveTab('sheet')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${activeTab === 'sheet' ? 'bg-amber-800 text-white' : 'text-stone-400 hover:bg-stone-800'}`}
          >
            <i className="fas fa-clipboard-list w-5"></i>
            <span>Inventory Sheet</span>
          </button>
        </div>

        <div className="p-4 border-t border-stone-800 space-y-3">
          <div className="flex items-center space-x-3 px-4 py-2 bg-stone-800 rounded-lg">
            <div className={`w-3 h-3 rounded-full ${shift.status === ShiftStatus.OPEN ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
            <span className="text-xs font-medium">Shift: {shift.status}</span>
          </div>
          <button
            onClick={() => store.logout()}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-stone-500 hover:text-white transition group"
          >
            <i className="fas fa-sign-out-alt group-hover:translate-x-1 transition-transform"></i>
            <span className="text-xs">Log Out</span>
          </button>
        </div>

        {/* Sidebar Footer Credits */}
        <div className="px-6 py-4 border-t border-stone-800 opacity-30">
          <p className="text-xs text-stone-400">NiksBakerySystem &copy; 2024</p>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 h-screen overflow-y-auto p-4 md:p-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-stone-800">
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </h2>
            <p className="text-stone-500">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>

          <div className="flex items-center space-x-3">
            {shift.status === ShiftStatus.CLOSED ? (
              <button
                onClick={() => {
                  // Automatically start shift using previous ending inventory (or 0 for all items)
                  store.startShift();
                }}
                className="bg-green-700 hover:bg-green-600 text-white px-6 py-2.5 rounded-full font-semibold transition-all shadow-md active:scale-95"
              >
                Start New Shift
              </button>
            ) : (
              <button
                onClick={async () => {
                  if (activeTab === 'sheet') {
                    // Step 2: Already on sheet, verify and close
                    const result = await Swal.fire({
                      title: 'End Shift?',
                      text: 'Have you verified the ending inventory counts?',
                      icon: 'question',
                      showCancelButton: true,
                      confirmButtonColor: '#15803d',
                      cancelButtonColor: '#78716c',
                      confirmButtonText: 'Yes, End Shift',
                      cancelButtonText: 'Cancel'
                    });
                    if (result.isConfirmed) {
                      // Generate PDF report before ending shift
                      generateShiftReport(store);
                      store.endShift(0);
                      setActiveTab('dashboard'); // Reset tab
                      Swal.fire({
                        icon: 'success',
                        title: 'Shift Ended',
                        text: 'PDF report has been downloaded',
                        confirmButtonColor: '#92400e'
                      });
                    }
                  } else {
                    // Step 1: Redirect to sheet and prefill
                    const result = await Swal.fire({
                      title: 'Verify Inventory',
                      text: 'Proceed to verify ending inventory?',
                      icon: 'question',
                      showCancelButton: true,
                      confirmButtonColor: '#92400e',
                      cancelButtonColor: '#78716c',
                      confirmButtonText: 'Yes, Proceed',
                      cancelButtonText: 'Cancel'
                    });
                    if (result.isConfirmed) {
                      store.prefillEndingInventory();
                      setActiveTab('sheet');
                      Swal.fire({
                        icon: 'info',
                        title: 'Inventory Pre-filled',
                        text: 'System has pre-filled ending inventory based on sales. Please verify counts and click End Shift again.',
                        confirmButtonColor: '#92400e'
                      });
                    }
                  }
                }}
                className={`${activeTab === 'sheet' ? 'bg-green-700 hover:bg-green-600' : 'bg-amber-800 hover:bg-amber-700'} text-white px-6 py-2.5 rounded-full font-semibold transition-all shadow-md active:scale-95`}
              >
                {activeTab === 'sheet' ? 'Confirm End Shift' : 'End Shift'}
              </button>
            )}
          </div>
        </header>

        {/* Tab Views */}
        {activeTab === 'dashboard' && <Dashboard store={store} />}
        {activeTab === 'production' && <ProductionPanel store={store} />}
        {activeTab === 'sales' && <SalesPos store={store} />}
        {activeTab === 'inventory' && <InventoryManager store={store} />}
        {activeTab === 'sheet' && <InventorySheet store={store} />}

      </main>
    </div>
  );
};

export default App;
