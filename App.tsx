
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Shift, 
  ShiftStatus, 
  BakeryItem, 
  ProductionEntry, 
  SaleEntry,
  AIInsight 
} from './types';
import { INITIAL_ITEMS } from './constants';
import { analyzeShift } from './services/geminiService';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, Cell 
} from 'recharts';

const App: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('is_authenticated') === 'true';
  });
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });

  // App State
  const [items, setItems] = useState<BakeryItem[]>(() => {
    const saved = localStorage.getItem('bakery_items');
    return saved ? JSON.parse(saved) : INITIAL_ITEMS;
  });

  const [shift, setShift] = useState<Shift>(() => {
    const saved = localStorage.getItem('current_shift');
    return saved ? JSON.parse(saved) : {
      id: Date.now().toString(),
      status: ShiftStatus.CLOSED,
      startTime: null,
      endTime: null,
      openingCash: 0,
      closingCash: null,
      production: [],
      sales: []
    };
  });

  const [activeTab, setActiveTab] = useState<'dashboard' | 'production' | 'sales' | 'inventory'>('dashboard');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [insight, setInsight] = useState<AIInsight | null>(null);

  // Sync with Local Storage
  useEffect(() => {
    localStorage.setItem('bakery_items', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem('current_shift', JSON.stringify(shift));
  }, [shift]);

  useEffect(() => {
    localStorage.setItem('is_authenticated', isAuthenticated.toString());
  }, [isAuthenticated]);

  // Derived Values
  const totalRevenue = useMemo(() => {
    return shift.sales.reduce((acc, sale) => {
      const item = items.find(i => i.id === sale.itemId);
      return acc + (item ? item.sellingPrice * sale.quantity : 0);
    }, 0);
  }, [shift.sales, items]);

  const totalCost = useMemo(() => {
    return shift.production.reduce((acc, prod) => {
      const item = items.find(i => i.id === prod.itemId);
      return acc + (item ? item.costPrice * prod.quantity : 0);
    }, 0);
  }, [shift.production, items]);

  const salesData = useMemo(() => {
    return items.map(item => {
      const totalSold = shift.sales
        .filter(s => s.itemId === item.id)
        .reduce((sum, s) => sum + s.quantity, 0);
      const totalProduced = shift.production
        .filter(p => p.itemId === item.id)
        .reduce((sum, p) => sum + p.quantity, 0);
      return {
        name: item.name,
        sold: totalSold,
        produced: totalProduced,
      };
    }).filter(d => d.sold > 0 || d.produced > 0);
  }, [shift, items]);

  // Handlers
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simple mock authentication
    if (loginForm.username === 'admin' && loginForm.password === 'bakery') {
      setIsAuthenticated(true);
    } else if (loginForm.username && loginForm.password) {
      // Allow any login for demo purposes, but show alert if empty
      setIsAuthenticated(true);
    } else {
      alert('Please enter credentials');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('is_authenticated');
  };

  const handleStartShift = (openingCash: number) => {
    setShift({
      id: Date.now().toString(),
      status: ShiftStatus.OPEN,
      startTime: Date.now(),
      endTime: null,
      openingCash,
      closingCash: null,
      production: [],
      sales: []
    });
    setInsight(null);
  };

  const handleEndShift = (closingCash: number) => {
    setShift(prev => ({
      ...prev,
      status: ShiftStatus.CLOSED,
      endTime: Date.now(),
      closingCash
    }));
  };

  const addProduction = (itemId: string, quantity: number) => {
    const entry: ProductionEntry = {
      id: Math.random().toString(36).substr(2, 9),
      itemId,
      quantity,
      timestamp: Date.now()
    };
    setShift(prev => ({
      ...prev,
      production: [...prev.production, entry]
    }));
  };

  const addSale = (itemId: string, quantity: number) => {
    const entry: SaleEntry = {
      id: Math.random().toString(36).substr(2, 9),
      itemId,
      quantity,
      timestamp: Date.now()
    };
    setShift(prev => ({
      ...prev,
      sales: [...prev.sales, entry]
    }));
  };

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    const result = await analyzeShift(shift, items);
    setInsight(result);
    setIsAnalyzing(false);
  };

  // Login View
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfaf5] p-6 relative overflow-hidden">
        {/* Background Decorations */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-amber-100 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-stone-200 rounded-full blur-3xl opacity-50"></div>
        
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-stone-100 p-10 relative z-10">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-amber-800 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <i className="fas fa-bread-slice text-3xl text-amber-200"></i>
            </div>
            <h1 className="text-3xl font-serif italic text-stone-800">NiksBakerySystem</h1>
            <p className="text-stone-400 mt-2">Manage your artisan creations with ease.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-stone-700 mb-2">Username</label>
              <input 
                type="text" 
                required
                className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 transition"
                placeholder="Enter username"
                value={loginForm.username}
                onChange={(e) => setLoginForm({...loginForm, username: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-stone-700 mb-2">Password</label>
              <input 
                type="password" 
                required
                className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 transition"
                placeholder="Enter password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-[0.98]"
            >
              Sign In
            </button>
          </form>

          <div className="mt-10 pt-6 border-t border-stone-100 text-center">
            <p className="text-xs text-stone-400 uppercase tracking-widest font-bold">Credits</p>
            <p className="text-sm text-stone-500 mt-1">NiksBakerySystem &copy; 2024</p>
            <p className="text-[10px] text-stone-300 italic">Built for modern artisan bakeries</p>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard View
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
        </div>

        <div className="p-4 border-t border-stone-800 space-y-3">
          <div className="flex items-center space-x-3 px-4 py-2 bg-stone-800 rounded-lg">
            <div className={`w-3 h-3 rounded-full ${shift.status === ShiftStatus.OPEN ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
            <span className="text-xs font-medium">Shift: {shift.status}</span>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-stone-500 hover:text-white transition group"
          >
            <i className="fas fa-sign-out-alt group-hover:translate-x-1 transition-transform"></i>
            <span className="text-xs">Log Out</span>
          </button>
        </div>

        {/* Sidebar Footer Credits */}
        <div className="px-6 py-4 border-t border-stone-800 opacity-30">
          <p className="text-[10px] text-stone-400">NiksBakerySystem &copy; 2024</p>
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
                  const cash = prompt("Enter Opening Cash Amount ($):", "150");
                  if (cash) handleStartShift(parseFloat(cash));
                }}
                className="bg-stone-800 hover:bg-stone-700 text-white px-6 py-2.5 rounded-full font-semibold transition-all shadow-md active:scale-95"
              >
                Start New Shift
              </button>
            ) : (
              <button 
                onClick={() => {
                  const cash = prompt("Enter Closing Cash Amount ($):");
                  if (cash) handleEndShift(parseFloat(cash));
                }}
                className="bg-amber-800 hover:bg-amber-700 text-white px-6 py-2.5 rounded-full font-semibold transition-all shadow-md active:scale-95"
              >
                End Shift
              </button>
            )}
          </div>
        </header>

        {/* Tab Views */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard icon="fa-dollar-sign" label="Revenue" value={`$${totalRevenue.toFixed(2)}`} color="bg-green-100 text-green-700" />
              <StatCard icon="fa-wheat-awn" label="Production Cost" value={`$${totalCost.toFixed(2)}`} color="bg-orange-100 text-orange-700" />
              <StatCard icon="fa-chart-pie" label="Profit (Est.)" value={`$${(totalRevenue - totalCost).toFixed(2)}`} color="bg-blue-100 text-blue-700" />
              <StatCard icon="fa-box" label="Total Sold" value={`${shift.sales.reduce((a, b) => a + b.quantity, 0)} units`} color="bg-purple-100 text-purple-700" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Sales vs Production Chart */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                <h3 className="text-lg font-bold mb-6 text-stone-700">Production vs Sales</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={salesData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="produced" fill="#92400e" radius={[4, 4, 0, 0]} name="Produced" />
                      <Bar dataKey="sold" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Sold" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* AI Insights Panel */}
              <div className="bg-gradient-to-br from-stone-800 to-stone-900 text-white p-6 rounded-2xl shadow-xl overflow-hidden relative">
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold flex items-center">
                      <i className="fas fa-wand-sparkles text-amber-400 mr-2"></i>
                      Smart Insight
                    </h3>
                    <button 
                      onClick={runAnalysis}
                      disabled={isAnalyzing || shift.production.length === 0}
                      className="text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-3 py-1.5 rounded-full transition"
                    >
                      {isAnalyzing ? 'Thinking...' : 'Analyze Shift'}
                    </button>
                  </div>

                  {insight ? (
                    <div className="space-y-4">
                      <div>
                        <p className="text-stone-300 text-sm italic mb-2">"{insight.summary}"</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Suggestions</p>
                        <ul className="space-y-2">
                          {insight.suggestions.map((s, idx) => (
                            <li key={idx} className="text-sm flex items-start">
                              <span className="text-amber-500 mr-2">•</span> {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-stone-800/50 p-3 rounded-lg mt-4">
                        <p className="text-xs font-bold text-stone-400 uppercase mb-1">Waste Outlook</p>
                        <p className="text-sm">{insight.projectedWaste}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-stone-400 text-center">
                      <i className="fas fa-brain text-4xl mb-4 opacity-20"></i>
                      <p className="text-sm">Click 'Analyze Shift' to get data-driven recommendations for your bakery.</p>
                    </div>
                  )}
                </div>
                {/* Visual decoration */}
                <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl"></div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'production' && (
          <div className="animate-in slide-in-from-bottom-4 duration-500">
            <div className="max-w-4xl mx-auto">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-200 mb-8">
                <h3 className="text-xl font-bold mb-6 text-stone-800 flex items-center">
                  <i className="fas fa-mortar-pestle mr-3 text-amber-700"></i>
                  Log New Production Batch
                </h3>
                {shift.status === ShiftStatus.CLOSED ? (
                  <div className="bg-amber-50 p-6 rounded-xl text-center">
                    <p className="text-amber-800 font-medium">Please open a shift to record production.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <label className="block text-sm font-semibold text-stone-700">Select Item</label>
                      <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto p-1">
                        {items.filter(i => i.category !== 'Beverage').map(item => (
                          <button
                            key={item.id}
                            onClick={() => {
                              const qty = prompt(`Quantity of ${item.name} produced:`);
                              if (qty) addProduction(item.id, parseInt(qty));
                            }}
                            className="text-left p-3 border border-stone-200 rounded-xl hover:border-amber-600 hover:bg-amber-50 transition group"
                          >
                            <span className="block font-medium text-stone-800 group-hover:text-amber-900">{item.name}</span>
                            <span className="text-xs text-stone-400">Unit: {item.unit}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="bg-stone-50 p-6 rounded-2xl">
                      <h4 className="font-bold text-stone-700 mb-4 border-b pb-2">Recent Production</h4>
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {shift.production.slice().reverse().map(p => {
                          const item = items.find(i => i.id === p.itemId);
                          return (
                            <div key={p.id} className="flex justify-between items-center text-sm bg-white p-3 rounded-lg border border-stone-100">
                              <span className="font-medium">{item?.name}</span>
                              <div className="flex items-center space-x-3">
                                <span className="text-stone-500">{p.quantity} {item?.unit}</span>
                                <span className="text-[10px] text-stone-300">{new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </div>
                          );
                        })}
                        {shift.production.length === 0 && <p className="text-stone-400 text-center py-8">No production recorded yet.</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sales' && (
          <div className="animate-in slide-in-from-bottom-4 duration-500">
            <div className="max-w-5xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Sales Keyboard/Grid */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold text-stone-800">Point of Sale</h3>
                      <div className="flex space-x-2">
                        {['Bread', 'Pastry', 'Beverage'].map(cat => (
                          <span key={cat} className="text-[10px] px-2 py-1 bg-stone-100 rounded-full text-stone-500 font-bold uppercase">{cat}</span>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {items.map(item => (
                        <button
                          key={item.id}
                          onClick={() => shift.status === ShiftStatus.OPEN && addSale(item.id, 1)}
                          disabled={shift.status === ShiftStatus.CLOSED}
                          className="flex flex-col items-center justify-center p-4 bg-stone-50 border border-stone-200 rounded-2xl hover:bg-amber-100 hover:border-amber-400 transition-all active:scale-95 disabled:opacity-50 group"
                        >
                          <span className="text-sm font-bold text-stone-800 text-center mb-1 group-hover:text-amber-900">{item.name}</span>
                          <span className="text-amber-600 font-bold text-xs">${item.sellingPrice.toFixed(2)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sales Receipt Log */}
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex flex-col h-[600px]">
                    <h3 className="text-lg font-bold mb-4 text-stone-800 border-b pb-4">Live Sales Feed</h3>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                      {shift.sales.slice().reverse().map(s => {
                        const item = items.find(i => i.id === s.itemId);
                        return (
                          <div key={s.id} className="flex justify-between items-center bg-stone-50 p-3 rounded-xl border border-stone-100 animate-in fade-in slide-in-from-right-4">
                            <div>
                              <p className="text-sm font-bold">{item?.name}</p>
                              <p className="text-[10px] text-stone-400">{new Date(s.timestamp).toLocaleTimeString()}</p>
                            </div>
                            <span className="font-bold text-green-600">${item?.sellingPrice.toFixed(2)}</span>
                          </div>
                        );
                      })}
                      {shift.sales.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-stone-300">
                          <i className="fas fa-receipt text-4xl mb-4 opacity-10"></i>
                          <p className="text-sm">Wait for sales...</p>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-stone-100">
                      <div className="flex justify-between items-center">
                        <span className="text-stone-500 font-medium">Session Total:</span>
                        <span className="text-2xl font-bold text-stone-800">${totalRevenue.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase">Item Name</th>
                    <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase">Category</th>
                    <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase">Cost</th>
                    <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase">Retail</th>
                    <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {items.map(item => (
                    <tr key={item.id} className="hover:bg-stone-50 transition">
                      <td className="px-6 py-4 font-medium text-stone-800">{item.name}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full uppercase">{item.category}</span>
                      </td>
                      <td className="px-6 py-4 text-stone-600">${item.costPrice.toFixed(2)}</td>
                      <td className="px-6 py-4 text-stone-800 font-semibold">${item.sellingPrice.toFixed(2)}</td>
                      <td className="px-6 py-4 text-center">
                        <button className="text-stone-400 hover:text-amber-700 mx-2">
                          <i className="fas fa-edit"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-6 bg-stone-50 border-t border-stone-200 text-center">
                <button 
                  onClick={() => {
                    const name = prompt("Item name:");
                    if (!name) return;
                    const cat = prompt("Category (Bread/Pastry/Cake/Beverage):", "Bread") as any;
                    const cost = parseFloat(prompt("Cost Price:", "1.00") || "0");
                    const sell = parseFloat(prompt("Selling Price:", "3.00") || "0");
                    
                    const newItem: BakeryItem = {
                      id: Date.now().toString(),
                      name,
                      category: cat,
                      unit: 'pcs',
                      costPrice: cost,
                      sellingPrice: sell
                    };
                    setItems([...items, newItem]);
                  }}
                  className="text-amber-800 font-bold flex items-center justify-center mx-auto hover:underline"
                >
                  <i className="fas fa-plus-circle mr-2"></i> Add New Catalog Item
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Credits for Main View */}
        <footer className="mt-12 py-6 text-center border-t border-stone-100">
           <p className="text-stone-400 text-xs font-medium uppercase tracking-widest">NiksBakerySystem</p>
           <p className="text-stone-300 text-[10px] mt-1 italic">Providing intelligent solutions for the artisan baking industry.</p>
        </footer>
      </main>
    </div>
  );
};

// Sub-components
const StatCard: React.FC<{ icon: string; label: string; value: string; color: string }> = ({ icon, label, value, color }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex items-center space-x-4">
    <div className={`w-12 h-12 flex items-center justify-center rounded-xl ${color}`}>
      <i className={`fas ${icon} text-lg`}></i>
    </div>
    <div>
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-stone-800">{value}</p>
    </div>
  </div>
);

export default App;
