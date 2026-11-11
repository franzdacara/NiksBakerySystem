import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { bakeryStore } from './src/models/BakeryStore';
import { ShiftStatus } from './types';
import { Login } from './src/components/Login';
import { Dashboard } from './src/components/Dashboard';
import { AdminDashboard } from './src/components/AdminDashboard';
import { ProductionPanel } from './src/components/ProductionPanel';
import { SalesPos } from './src/components/SalesPos';
import { InventoryManager } from './src/components/InventoryManager';
import { InventorySheet } from './src/components/InventorySheet';
import { DischargePanel } from './src/components/DischargePanel';
import { ShiftReportsPanel } from './src/components/ShiftReportsPanel';
import { Credits } from './src/components/Credits';
import { generateShiftReport } from './services/pdfReport';

// Hook to subscribe to store updates
const useBakeryStore = () => {
  const [, setTick] = useState(0);
  useEffect(() => {
    return bakeryStore.subscribe(() => setTick(t => t + 1));
  }, []);
  return bakeryStore;
};

type Tab = 'admin' | 'dashboard' | 'production' | 'sales' | 'inventory' | 'discharge' | 'sheet' | 'reports';

interface NavItem {
  key: Tab;
  label: string;
  icon: string;
  adminOnly?: boolean;
  danger?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'admin', label: 'Admin Dashboard', icon: 'fa-chart-pie', adminOnly: true },
  { key: 'sales', label: 'Counter', icon: 'fa-cash-register' },
  { key: 'dashboard', label: 'Shift Overview', icon: 'fa-chart-line' },
  { key: 'production', label: 'Production', icon: 'fa-mitten' },
  { key: 'inventory', label: 'Items Library', icon: 'fa-boxes' },
  { key: 'sheet', label: 'Inventory Sheet', icon: 'fa-clipboard-list' },
  { key: 'discharge', label: 'BO / Discharge', icon: 'fa-trash-alt', danger: true },
  { key: 'reports', label: 'Shift Reports', icon: 'fa-file-alt' },
];

const SIDEBAR_HIDDEN_KEY = 'niks_sidebar_hidden';

const FullScreenMessage: React.FC<{ icon: string; title: string; text: string; spinner?: boolean; actions?: React.ReactNode }> = ({ icon, title, text, spinner, actions }) => (
  <div className="min-h-screen flex items-center justify-center bg-[#fdfaf5] p-6">
    <div className="w-full max-w-md text-center">
      <div className="w-20 h-20 bg-amber-800 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg">
        <i className={`fas ${icon} text-3xl text-amber-200`}></i>
      </div>
      <h1 className="text-2xl font-serif italic text-stone-800">{title}</h1>
      <p className="text-stone-500 mt-2 break-words">{text}</p>
      {spinner && <i className="fas fa-spinner fa-spin text-amber-700 text-xl mt-5"></i>}
      {actions && <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">{actions}</div>}
    </div>
  </div>
);

const App: React.FC = () => {
  const store = useBakeryStore();
  const { isAuthenticated, shift, isAdmin, currentUser } = store;
  // Admins land on their dashboard, cashiers land straight on the POS
  const [activeTab, setActiveTab] = useState<Tab>(isAdmin ? 'admin' : 'sales');
  const [menuOpen, setMenuOpen] = useState(false);
  // Tablet/desktop only: the sidebar can be hidden to give the page the full width.
  // Remembered on this device; phones keep using the slide-in drawer.
  const [sidebarHidden, setSidebarHidden] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_HIDDEN_KEY) === '1'; } catch { return false; }
  });
  const toggleSidebar = () => {
    setSidebarHidden(hidden => {
      try { localStorage.setItem(SIDEBAR_HIDDEN_KEY, hidden ? '0' : '1'); } catch { /* storage blocked: just not remembered */ }
      return !hidden;
    });
  };

  // When someone signs in (or out and a different role signs in), reset to their home tab
  useEffect(() => {
    if (isAuthenticated) setActiveTab(isAdmin ? 'admin' : 'sales');
    setMenuOpen(false);
  }, [isAuthenticated, isAdmin]);

  // Everything shown comes from the database, so keep it fresh: when the tab/window is
  // returned to, and every 30 seconds while it is open (also picks up shift status changes
  // made on another device).
  useEffect(() => {
    if (!isAuthenticated) return;
    const refresh = () => { if (document.visibilityState === 'visible') void store.sync(); };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, 30_000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      clearInterval(timer);
    };
  }, [store, isAuthenticated]);

  // ...and every time a different page is opened
  useEffect(() => {
    if (isAuthenticated) void store.sync();
  }, [store, isAuthenticated, activeTab]);

  // Checking the saved login with the database
  if (store.isInitializing) {
    return <FullScreenMessage icon="fa-bread-slice" title="NiksBakerySystem" text="Starting up…" spinner />;
  }

  if (!isAuthenticated) {
    return <Login store={store} />;
  }

  // Loading everything from the database after login
  if (store.isLoading) {
    return <FullScreenMessage icon="fa-bread-slice" title="Loading your data" text="Getting items, shift and stock from the database…" spinner />;
  }

  // The database could not be reached and there is nothing to show
  if (store.loadError && store.items.length === 0) {
    return (
      <FullScreenMessage
        icon="fa-triangle-exclamation"
        title="Can't reach the database"
        text={store.loadError}
        actions={
          <>
            <button onClick={() => { store.isLoading = true; void store.loadFromSupabase(); }} className="h-12 px-6 rounded-xl bg-amber-800 text-white font-bold active:scale-95 transition">Try again</button>
            <button onClick={() => store.logout()} className="h-12 px-6 rounded-xl bg-white border border-stone-200 text-stone-600 font-bold active:scale-95 transition">Log out</button>
          </>
        }
      />
    );
  }

  const visibleNav = NAV_ITEMS.filter(n => !n.adminOnly || isAdmin);
  // Never render the admin view for non-admins, even if state was somehow set
  const tab: Tab = activeTab === 'admin' && !isAdmin ? 'sales' : activeTab;
  const title = NAV_ITEMS.find(n => n.key === tab)?.label ?? '';
  const isOpen = shift.status === ShiftStatus.OPEN;
  // The Daily Inventory Sheet stays locked until End Shift is pressed (see store.inventorySheetLocked)
  const sheetLocked = store.inventorySheetLocked;
  const onSheet = tab === 'sheet' && !sheetLocked;

  const goTo = (key: Tab) => {
    setActiveTab(key);
    setMenuOpen(false);
  };

  const shiftButton = isOpen ? (
    <button
      onClick={async () => {
        if (onSheet) {
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
            setActiveTab(isAdmin ? 'admin' : 'dashboard'); // Reset tab
            Swal.fire({
              icon: 'success',
              title: 'Shift Ended',
              text: 'PDF report has been downloaded',
              confirmButtonColor: '#92400e'
            });
          }
        } else if (store.endShiftStarted) {
          // Counts are already being verified (e.g. the page was reloaded): carry on
          // without pre-filling again, which would overwrite what was typed.
          setActiveTab('sheet');
        } else {
          // Step 1: Redirect to sheet and prefill (this also unlocks the Inventory Sheet)
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
      className={`${onSheet ? 'bg-green-700 hover:bg-green-600' : 'bg-amber-800 hover:bg-amber-700'} text-white h-10 sm:h-11 px-4 sm:px-6 text-sm sm:text-base whitespace-nowrap rounded-full font-semibold transition-all shadow-md active:scale-95`}
    >
      {onSheet ? 'Confirm End Shift' : 'End Shift'}
    </button>
  ) : (
    <button
      onClick={() => {
        // Automatically start shift using previous ending inventory (or 0 for all items)
        store.startShift();
      }}
      disabled={store.isStartingShift}
      className="bg-green-700 hover:bg-green-600 text-white h-10 sm:h-11 px-4 sm:px-6 text-sm sm:text-base whitespace-nowrap rounded-full font-semibold transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
    >
      {store.isStartingShift && <i className="fas fa-spinner fa-spin"></i>}
      <span>{store.isStartingShift ? 'Starting Shift...' : 'Start New Shift'}</span>
    </button>
  );

  return (
    <div className="min-h-screen md:flex bg-[#fdfaf5]">
      {/* ===== Mobile top bar ===== */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 bg-stone-900 text-white px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="w-11 h-11 rounded-xl flex items-center justify-center text-xl active:bg-stone-800"
        >
          <i className="fas fa-bars"></i>
        </button>
        <h1 className="flex-1 min-w-0 truncate text-lg font-serif italic text-amber-200">{title}</h1>
        <span className="flex items-center gap-2 px-3 h-9 rounded-full bg-stone-800 text-xs font-semibold">
          <span className={`w-2.5 h-2.5 rounded-full ${isOpen ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></span>
          {isOpen ? 'Open' : 'Closed'}
        </span>
      </header>

      {/* ===== Sidebar (drawer on phones, fixed column from tablet up) ===== */}
      {menuOpen && <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMenuOpen(false)}></div>}
      <nav
        className={`fixed md:sticky inset-y-0 left-0 md:left-auto z-50 md:z-auto w-72 md:w-64 md:top-0 md:h-screen bg-stone-900 text-white flex flex-col flex-shrink-0 transition-[transform,margin,visibility] duration-300 ease-in-out motion-reduce:transition-none${menuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 ${sidebarHidden ? 'md:-ml-64 md:invisible' : ''}`}
        aria-label="Main navigation"
      >
        <div className="p-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-serif italic text-amber-200">NiksBakerySystem</h1>
            <p className="text-stone-400 text-[10px] uppercase tracking-tighter mt-1 font-bold">Premium Management</p>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="md:hidden w-10 h-10 -mr-2 -mt-2 rounded-full text-stone-400 active:bg-stone-800 flex items-center justify-center"
          >
            <i className="fas fa-xmark text-lg"></i>
          </button>
          <button
            onClick={toggleSidebar}
            aria-label="Hide sidebar"
            title="Hide sidebar"
            className="hidden md:flex w-9 h-9 -mr-2 -mt-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 active:bg-stone-800 items-center justify-center transition"
          >
            <i className="fas fa-bars"></i>
          </button>
        </div>

        <div className="flex-1 px-4 space-y-1.5 overflow-y-auto">
          {visibleNav.map(n => {
            const active = tab === n.key;
            const locked = n.key === 'sheet' && sheetLocked;
            return (
              <button
                key={n.key}
                onClick={() => goTo(n.key)}
                disabled={locked}
                title={locked ? 'Locked until you press End Shift' : undefined}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center space-x-3 px-4 h-12 rounded-lg transition ${locked ? 'text-stone-600 opacity-60 cursor-not-allowed' : active ? (n.danger ? 'bg-red-700' : 'bg-amber-800') + ' text-white' : 'text-stone-400 hover:bg-stone-800 active:bg-stone-800'}`}
              >
                <i className={`fas ${n.icon} w-5`}></i>
                <span className="flex-1 text-left">{n.label}</span>
                {locked && <i className="fas fa-lock text-xs"></i>}
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-stone-800 space-y-3">
          {currentUser && (
            <div className="flex items-center space-x-3 px-4 py-2 bg-stone-800 rounded-lg">
              <div className="w-8 h-8 rounded-full bg-amber-800 flex items-center justify-center text-sm font-bold">
                {currentUser.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{currentUser.displayName}</p>
                <p className="text-[10px] uppercase tracking-wider text-stone-400">{isAdmin ? 'Admin' : 'Staff'}</p>
              </div>
            </div>
          )}
          <div className="flex items-center space-x-3 px-4 py-2 bg-stone-800 rounded-lg">
            <div className={`w-3 h-3 rounded-full ${isOpen ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
            <span className="text-xs font-medium">Shift: {shift.status}</span>
          </div>
          <button
            onClick={() => store.logout()}
            className="w-full flex items-center justify-center space-x-2 px-4 h-11 text-stone-400 hover:text-white transition group"
          >
            <i className="fas fa-sign-out-alt group-hover:translate-x-1 transition-transform"></i>
            <span className="text-sm">Log Out</span>
          </button>
        </div>

        {/* Sidebar Footer Credits */}
        <div className="px-6 py-4 border-t border-stone-800 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Credits tone="dark" />
        </div>
      </nav>

      {/* ===== Main content ===== */}
      <main className="flex-1 min-w-0 md:h-screen md:overflow-y-auto p-3 sm:p-5 md:p-8">
        <header className="flex flex-row items-center justify-between mb-4 md:mb-8 gap-3 md:gap-4">
          {/* Always rendered so it can grow/fade in step with the sidebar sliding away */}
          <button
            onClick={toggleSidebar}
            aria-label="Show sidebar"
            title="Show sidebar"
            className={`hidden md:flex h-11 flex-shrink-0 rounded-full bg-white border-stone-200 items-center justify-center text-stone-600 hover:bg-stone-100 active:scale-95 overflow-hidden transition-all duration-300 ease-in-out motion-reduce:transition-none ${sidebarHidden ? 'w-11 border opacity-100' : 'w-0 -mr-4 border-0 opacity-0 invisible pointer-events-none'}`}
          >
            <i className="fas fa-bars"></i>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="hidden md:block text-3xl font-bold text-stone-800">{title}</h2>
            <p className="text-stone-500 text-xs sm:text-sm md:text-base">
              {new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            {store.lastSyncedAt && (
              <p className={`text-[11px] mt-0.5 ${store.loadError ? 'text-red-500' : 'text-stone-400'}`}>
                {store.loadError
                  ? 'Can\'t reach the database - showing the last data received'
                  : `Synced with database ${new Date(store.lastSyncedAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}`}
              </p>
            )}
          </div>
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              onClick={() => void store.sync()}
              disabled={store.isSyncing}
              aria-label="Refresh from database"
              title="Refresh from database"
              className={`relative h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0 rounded-full bg-white border flex items-center justify-center text-stone-600 hover:bg-stone-100 active:scale-95 transition disabled:opacity-60 ${store.loadError ? 'border-red-300' : 'border-stone-200'}`}
            >
              <i className={`fas fa-rotate ${store.isSyncing ? 'fa-spin' : ''}`}></i>
              {store.loadError && <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-red-500"></span>}
            </button>
            {shiftButton}
          </div>
        </header>

        {/* Tab Views */}
        {tab === 'admin' && <AdminDashboard store={store} />}
        {tab === 'dashboard' && <Dashboard store={store} />}
        {tab === 'production' && <ProductionPanel store={store} />}
        {tab === 'sales' && <SalesPos store={store} sidebarHidden={sidebarHidden} />}
        {tab === 'inventory' && <InventoryManager store={store} />}
        {tab === 'sheet' && <InventorySheet store={store} />}
        {tab === 'discharge' && <DischargePanel store={store} />}
        {tab === 'reports' && <ShiftReportsPanel store={store} />}
      </main>
    </div>
  );
};

export default App;
