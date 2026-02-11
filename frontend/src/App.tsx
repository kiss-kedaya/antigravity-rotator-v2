import {useState, useEffect, useRef} from 'react';
import './index.css';
import {GetWorkspaces, GetConfig, SaveConfig, RunRotation, GetAccountStatus, ImportAccounts, SwitchModel, SwitchAccount, GetVipEmail, GetAgents, SelectFile, StartAutoRotation, StopAutoRotation} from "../wailsjs/go/main/App";
import {scanner, config, engine} from "../wailsjs/go/models";

function App() {
    const [workspaces, setWorkspaces] = useState<scanner.WorkspaceInfo[]>([]);
    const [agents, setAgents] = useState<engine.AgentInfo[]>([]);
    const [cfg, setCfg] = useState<config.AppConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [status, setStatus] = useState("系统就绪");
    const [accountStatus, setAccountStatus] = useState<{[key: string]: number}>({});
    const [vipEmail, setVipEmail] = useState("");
    const [showModelMenu, setShowModelMenu] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [activeTab, setActiveTab] = useState("overview");
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const menuRef = useRef<HTMLDivElement>(null);

    // Theme definitions
    const t = {
        bg: theme === 'dark' ? 'bg-[#020617]' : 'bg-slate-50',
        text: theme === 'dark' ? 'text-slate-200' : 'text-slate-600',
        heading: theme === 'dark' ? 'text-white' : 'text-slate-900',
        subtext: theme === 'dark' ? 'text-slate-400' : 'text-slate-500',
        card: theme === 'dark' ? 'bg-white/5 border-white/5' : 'bg-white border-slate-200 shadow-sm',
        input: theme === 'dark' ? 'bg-slate-950 border-white/10' : 'bg-slate-100 border-slate-200',
        border: theme === 'dark' ? 'border-white/5' : 'border-slate-200',
        accentText: theme === 'dark' ? 'text-blue-400' : 'text-blue-600',
    };

    const fetchData = async () => {
        const ws = await GetWorkspaces();
        const ags = await GetAgents();
        const c = await GetConfig();
        const vip = await GetVipEmail();
        setWorkspaces(ws || []);
        setAgents(ags || []);
        setCfg(c);
        setVipEmail(vip);
        setLoading(false);
    };

    const refreshData = async () => {
        setRefreshing(true);
        setStatus("正在获取配额...");
        try {
            const stats = await GetAccountStatus();
            if (stats && Object.keys(stats).length > 0) {
                setAccountStatus(stats);
            }
            await fetchData();
            setStatus("同步完成");
        } catch (e) {
            setStatus("刷新失败");
        }
        setRefreshing(false);
    };

    useEffect(() => {
        fetchData();
        refreshData();
        
        // 监听后端推送的实时状态
        const unsub = (window as any).runtime.EventsOn("status_updated", (stats: any) => {
            console.log("Status update received:", stats);
            if (stats) setAccountStatus(stats);
        });

        const timer = setInterval(() => setCurrentTime(new Date()), 1000);

        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowModelMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            unsub();
            clearInterval(timer);
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleRotate = async () => {
        setStatus("正在执行轮换...");
        const result = await RunRotation();
        
        let translated = result;
        if (result === "Rotation Cycle Completed") translated = "轮换周期已完成";
        if (result.startsWith("Error:")) translated = "错误: " + result.substring(6);
        
        setStatus(translated);
        await refreshData();
    };

    const handleImport = async () => {
        try {
            const jsonStr = await SelectFile();
            if (!jsonStr) return; // Cancelled

            setStatus("正在导入凭据...");
            const result = await ImportAccounts(jsonStr);
            if (result === "Success") {
                setStatus("导入成功");
                await refreshData();
            } else {
                setStatus(result);
            }
        } catch (e) {
            setStatus("导入失败: " + e);
        }
    };

    const handleSwitchAccount = async (email: string) => {
        if (email === vipEmail) return;
        setStatus(`正在调度节点: ${email}...`);
        const result = await SwitchAccount(email);
        if (result === "Success") {
            setStatus("节点已提拔为主账号");
            await refreshData();
        } else {
            setStatus(result);
        }
    };

    const handleSwitchModel = async (modelID: string) => {
        setStatus(`正在配置核心模型: ${modelID}...`);
        const result = await SwitchModel(modelID);
        if (result === "Success") {
            setStatus("模型重配置成功");
            setShowModelMenu(false);
            await refreshData();
        } else {
            setStatus(result);
        }
    };

    const promoteModelPriority = async (modelId: string, currentIndex: number) => {
        if (!cfg || currentIndex === 0) return;
        
        const priority = [...cfg.rotator.modelPriority];
        priority.splice(currentIndex, 1);
        priority.unshift(modelId);
        
        const newCfg = {
            ...cfg,
            rotator: {
                ...cfg.rotator,
                modelPriority: priority
            }
        };
        
        setCfg(newCfg as any);
        setStatus(`已提升优先级: ${modelId.split('/').pop()}`);
        await SaveConfig(newCfg as any);
    };

    const updateThreshold = async (value: number) => {
        if (!cfg) return;
        const newCfg = {...cfg};
        newCfg.rotator.quotas.low = value;
        setCfg(newCfg as any);
        await SaveConfig(newCfg as any);
        setStatus("阈值已更新");
    };

    const toggleAutoRotate = async () => {
        if (!cfg) return;
        if (cfg.rotator.autoRotate) {
            await StopAutoRotation();
            setStatus("自动轮换已停止");
        } else {
            await StartAutoRotation(cfg.rotator.rotateInterval || 10);
            setStatus("自动轮换已启动");
        }
        await refreshData();
    };

    const updateInterval = async (val: number) => {
        if (!cfg) return;
        await StartAutoRotation(val);
        await refreshData();
    };

    if (loading) return (
        <div className={`flex flex-col items-center justify-center min-h-screen font-black tracking-[0.5em] ${theme === 'dark' ? 'bg-[#020617] text-blue-500' : 'bg-slate-50 text-blue-600'}`}>
            <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-8" />
            INITIALIZING SYSTEM...
        </div>
    );

    const availableModels = [
        { id: "google-antigravity/gemini-3-pro-high", name: "Gemini 3 Pro", desc: "最高智能与推理能力" },
        { id: "google-antigravity/gemini-3-flash", name: "Gemini 3 Flash", desc: "极速响应与超低延迟" },
        { id: "google-antigravity/gemini-3-image", name: "Gemini 3 Image", desc: "视觉生成与图像分析" },
        { id: "google-antigravity/claude-sonnet-4-5-thinking", name: "Claude 4.5 Tk", desc: "深度思考与超长上下文" }
    ];

    const TabButton = ({ id, label, icon }: { id: string, label: string, icon: any }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${
                activeTab === id 
                    ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' 
                    : 'bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300'
            }`}
        >
            {icon}
            {label}
        </button>
    );

    return (
        <div className={`min-h-screen ${t.bg} ${t.text} selection:bg-blue-500/30 font-sans relative overflow-hidden transition-colors duration-500`}>
            <div className="scanline" />
            
            {/* System Hub Header */}
            <header className={`p-6 border-b backdrop-blur-xl sticky top-0 z-40 transition-colors ${theme === 'dark' ? 'border-white/5 bg-slate-950/20' : 'border-slate-200 bg-white/80'}`}>
                <div className="max-w-[1600px] mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-6">
                        <div className="relative group">
                            <div className={`absolute inset-0 blur-xl rounded-full scale-150 transition-all ${theme === 'dark' ? 'bg-blue-500/20 group-hover:bg-blue-500/40' : 'bg-blue-400/20 group-hover:bg-blue-400/30'}`} />
                            <div className="relative w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-2xl border border-white/10 overflow-hidden transform group-hover:rotate-6 transition-all">
                                <span className="text-3xl font-black text-white italic">Λ</span>
                                <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20" />
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className={`text-2xl font-black tracking-tighter uppercase italic ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>Antigravity Rotator</h1>
                                <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold tracking-wider">V2.6.0-PRO (中文)</span>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> 网络状态稳定</span>
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full glow-pulse" /> {status}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4 items-center">
                        <button 
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'bg-white/5 hover:bg-white/10 text-yellow-400' : 'bg-slate-100 hover:bg-slate-200 text-amber-500'}`}
                        >
                            {theme === 'dark' ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                </svg>
                            )}
                        </button>
                        <div className={`w-[1px] h-6 mx-2 ${theme === 'dark' ? 'bg-white/10' : 'bg-slate-300'}`} />
                        
                        <TabButton id="overview" label="系统概览" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>} />
                        <TabButton id="agents" label="智能体集群" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>} />
                        <TabButton id="matrix" label="配额矩阵" icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>} />
                        
                        <div className={`w-[1px] h-6 mx-2 ${theme === 'dark' ? 'bg-white/10' : 'bg-slate-300'}`} />
                        
                        <button onClick={handleImport} className="btn-modern bg-white/5 hover:bg-white/10 text-emerald-400 border border-emerald-500/20 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>
                            导入 JSON
                        </button>
                        <button onClick={handleRotate} className="btn-modern bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-[0_0_20px_rgba(37,99,235,0.3)]">
                            强制轮换
                        </button>
                        <button onClick={refreshData} disabled={refreshing} className={`btn-modern border p-2 rounded-lg ${theme === 'dark' ? 'bg-slate-900 border-white/5 hover:bg-slate-800' : 'bg-slate-100 border-slate-300 hover:bg-slate-200'}`}>
                            <svg className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'} ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>
                </div>
            </header>

            <main className="p-8 max-w-[1600px] mx-auto min-h-[calc(100vh-120px)]">
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Status Panel */}
                        {/* Status Panel */}
                        <section className="col-span-1 lg:col-span-2 space-y-6">
                            <div className={`p-8 relative rounded-3xl border shadow-2xl backdrop-blur-2xl transition-all ${t.card} ${theme === 'dark' ? 'shadow-black/20' : 'shadow-slate-200/50'}`}>
                                <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                                    <div className="absolute top-0 right-0 p-10 opacity-5">
                                        <span className="text-9xl font-black italic">NEXUS</span>
                                    </div>
                                </div>
                                <div className="mb-8">
                                    <h2 className="text-base font-bold uppercase tracking-widest text-blue-500 mb-2">引擎控制中心</h2>
                                    <p className={`text-sm max-w-md font-medium leading-relaxed ${t.subtext}`}>系统级模型同步与智能节点分发已启用。</p>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Model Priority Queue */}
                                    <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">执行优先级 (Priority Queue)</label>
                                        <div className="space-y-3">
                                            {cfg?.rotator?.modelPriority?.map((modelId, index) => {
                                                const modelInfo = availableModels.find(m => m.id === modelId);
                                                return (
                                                    <div 
                                                        key={modelId} 
                                                        onClick={() => promoteModelPriority(modelId, index)}
                                                        className={`flex items-center gap-3 group/item ${index === 0 ? 'cursor-default' : 'cursor-pointer hover:translate-x-1 transition-transform'}`}
                                                        title={index === 0 ? "当前首选模型" : "点击提升为首选"}
                                                    >
                                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${index === 0 ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : (theme === 'dark' ? 'bg-slate-800 text-slate-500 group-hover/item:bg-blue-500/50 group-hover/item:text-white' : 'bg-slate-200 text-slate-400 group-hover/item:bg-blue-400 group-hover/item:text-white')}`}>
                                                            {index + 1}
                                                        </div>
                                                        <div className={`flex-1 p-2 rounded-lg border flex justify-between items-center transition-all ${index === 0 ? (theme === 'dark' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-200') : (theme === 'dark' ? 'bg-white/5 border-white/5 group-hover/item:border-blue-500/30 group-hover/item:bg-white/10' : 'bg-white border-slate-200 group-hover/item:border-blue-400 group-hover/item:bg-slate-50')}`}>
                                                            <span className={`text-sm font-bold transition-colors ${index === 0 ? 'text-blue-500' : (theme === 'dark' ? 'text-slate-400 group-hover/item:text-slate-200' : 'text-slate-500 group-hover/item:text-slate-700')}`}>{modelInfo ? modelInfo.name : modelId.split('/').pop()}</span>
                                                            <div className="flex items-center gap-2">
                                                                {index === 0 ? (
                                                                    <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded font-bold tracking-wider">PRIMARY</span>
                                                                ) : (
                                                                    <svg className="w-3 h-3 text-slate-500 opacity-0 group-hover/item:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {(!cfg?.rotator?.modelPriority || cfg.rotator.modelPriority.length === 0) && (
                                                <div className="text-sm text-slate-500 italic p-4 text-center">未配置优先级策略</div>
                                            )}
                                        </div>
                                    </div>
                                    {/* Model Selector */}
                                    <div className="relative" ref={menuRef}>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">核心模型协议 (Core Protocol)</label>
                                        <button 
                                            onClick={() => setShowModelMenu(!showModelMenu)}
                                            className={`w-full border rounded-2xl p-4 text-left transition-all flex justify-between items-center group ${t.input} hover:border-blue-500/50`}
                                        >
                                            <span className={`text-sm font-bold ${t.heading}`}>选择核心配置</span>
                                            <svg className={`w-5 h-5 text-slate-500 group-hover:text-blue-500 transition-transform ${showModelMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                        
                                        {showModelMenu && (
                                            <div className={`absolute z-50 left-0 right-0 mt-2 border rounded-2xl shadow-2xl overflow-hidden backdrop-blur-3xl ${theme === 'dark' ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'}`}>
                                                {availableModels.map(m => (
                                                    <button 
                                                        key={m.id}
                                                        onClick={() => handleSwitchModel(m.id)}
                                                        className={`w-full p-4 text-left hover:bg-blue-600 transition-all group flex flex-col gap-1 border-b last:border-0 ${t.border}`}
                                                    >
                                                        <div className={`text-sm font-bold group-hover:text-white uppercase tracking-tight ${t.heading}`}>{m.name}</div>
                                                        <div className="text-xs text-slate-500 group-hover:text-blue-100 font-medium uppercase">{m.desc}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Threshold Control */}
                                    <div>
                                        <div className="flex justify-between items-center mb-4">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">自动隔离阈值 (Threshold)</label>
                                            <span className="text-xl font-bold text-blue-500 italic">{cfg?.rotator?.quotas?.low ?? 21}%</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="100" 
                                            value={cfg?.rotator?.quotas?.low ?? 21}
                                            onChange={(e) => updateThreshold(parseInt(e.target.value))}
                                            className={`w-full h-1.5 rounded-full appearance-none cursor-pointer accent-blue-500 border ${theme === 'dark' ? 'bg-slate-950 border-white/5' : 'bg-slate-200 border-slate-300'}`}
                                        />
                                        <div className={`relative h-1 w-full mt-2 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-200'}`}>
                                            <div 
                                                className="h-full bg-blue-500/20"
                                                style={{ width: `${cfg?.rotator?.quotas?.low ?? 21}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Auto-Rotation Control */}
                                    <div className={`md:col-span-2 border-t pt-6 mt-2 ${t.border}`}>
                                         <div className={`flex justify-between items-center p-4 rounded-xl ${theme === 'dark' ? 'bg-white/5' : 'bg-slate-100'}`}>
                                             <div className="flex items-center gap-4">
                                                 <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cfg?.rotator?.autoRotate ? 'bg-emerald-500/20 text-emerald-400' : (theme === 'dark' ? 'bg-slate-800 text-slate-500' : 'bg-slate-200 text-slate-400')}`}>
                                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                 </div>
                                                 <div>
                                                     <h3 className={`text-sm font-bold ${t.heading}`}>自动轮换 (Auto-Rotation)</h3>
                                                     <p className="text-xs text-slate-400">Scheduled optimized model switching</p>
                                                 </div>
                                             </div>
                                             <div className="flex items-center gap-4">
                                                 <div className={`flex items-center gap-2 rounded-lg p-1 ${theme === 'dark' ? 'bg-black/20' : 'bg-white border border-slate-200'}`}>
                                                     <input 
                                                        type="number" 
                                                        value={cfg?.rotator?.rotateInterval || 10}
                                                        onChange={(e) => updateInterval(parseInt(e.target.value))}
                                                        className={`w-16 bg-transparent text-right text-sm font-bold focus:outline-none ${theme === 'dark' ? 'text-white' : 'text-slate-700'}`}
                                                     />
                                                     <span className="text-xs text-slate-500 font-bold pr-2">MIN</span>
                                                 </div>
                                                 <button 
                                                    onClick={toggleAutoRotate}
                                                    className={`relative w-12 h-6 rounded-full transition-colors ${cfg?.rotator?.autoRotate ? 'bg-emerald-500' : (theme === 'dark' ? 'bg-slate-700' : 'bg-slate-300')}`}
                                                 >
                                                     <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${cfg?.rotator?.autoRotate ? 'translate-x-6' : ''}`} />
                                                 </button>
                                             </div>
                                         </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Recent Activity / Workspaces */}
                        <section className="col-span-1 space-y-6">
                             <div className={`p-6 bg-blue-600/5 h-full rounded-2xl border ${theme === 'dark' ? 'glass-card border-blue-500/10' : 'bg-white border-blue-100 shadow-sm'}`}>
                                <h2 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-4 px-1">活跃工作区</h2>
                                <div className="space-y-3">
                                    {workspaces.map((ws, i) => (
                                        <div key={i} className={`flex items-center justify-between group cursor-default p-2 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                                            <span className={`text-xs font-medium transition-colors truncate max-w-[200px] ${t.subtext} group-hover:text-slate-300`}>{ws.path}</span>
                                            <div className="flex gap-1.5">
                                                <div title="配置状态" className={`w-2 h-2 rounded-full ${ws.hasConfig ? 'bg-emerald-500' : 'bg-slate-300'} shadow-[0_0_8px_currentColor]`} />
                                                <div title="凭据状态" className={`w-2 h-2 rounded-full ${ws.hasAuthProfiles ? 'bg-blue-500' : 'bg-slate-300'} shadow-[0_0_8px_currentColor]`} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {activeTab === 'agents' && (
                    <div className={`p-8 rounded-3xl border ${t.card}`}>
                         <div className="flex justify-between items-center mb-8">
                            <h2 className="text-base font-bold uppercase tracking-widest text-blue-500">活跃智能体集群 (Agent Cluster)</h2>
                            <span className="text-xs font-bold text-slate-500">{agents.length} AGENTS ONLINE</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {agents.map((agent) => (
                                <div key={agent.id} className={`p-6 rounded-2xl border transition-all group ${theme === 'dark' ? 'bg-white/5 border-white/5 hover:border-blue-500/30 hover:bg-blue-600/5' : 'bg-white border-slate-200 hover:border-blue-500/30 hover:bg-blue-50 shadow-sm'}`}>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-3xl shadow-inner ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-100'}`}>
                                            {agent.emoji}
                                        </div>
                                        <div className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded border border-blue-500/20">
                                            ACTIVE
                                        </div>
                                    </div>
                                    <h3 className={`text-base font-bold mb-1 transition-colors ${t.heading} group-hover:text-blue-500`}>{agent.name}</h3>
                                    <p className="text-xs font-mono text-slate-500 mb-4">{agent.id}</p>
                                    <div className={`pt-4 border-t ${t.border}`}>
                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Current Model</div>
                                        <div className="text-sm font-mono text-emerald-400">{agent.currentModel}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'matrix' && (
                     <div className={`p-0 overflow-hidden rounded-3xl border ${t.card}`}>
                        <div className={`p-6 border-b flex justify-between items-center ${theme === 'dark' ? 'bg-slate-900/50 border-white/5' : 'bg-slate-50/50 border-slate-200'}`}>
                             <div className="flex items-center gap-3">
                                <h2 className="text-base font-bold uppercase tracking-widest text-blue-500">资源配额矩阵 (Resource Matrix)</h2>
                                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-xs font-bold rounded border border-emerald-500/20">LIVE DATA</span>
                             </div>
                             <div className="text-xs font-bold text-slate-500">Showing {cfg?.rotator?.accounts?.length || 0} Accounts</div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className={`text-xs font-bold uppercase tracking-wider ${theme === 'dark' ? 'bg-white/5 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
                                        <th className={`p-4 border-b min-w-[200px] ${t.border}`}>Account Identity</th>
                                        <th className={`p-4 border-b text-center w-32 ${t.border}`}>Pro High</th>
                                        <th className={`p-4 border-b text-center w-32 ${t.border}`}>Flash</th>
                                        <th className={`p-4 border-b text-center w-32 ${t.border}`}>Claude 4.5</th>
                                        <th className={`p-4 border-b text-right w-40 ${t.border}`}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody className={`text-sm font-mono ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                                    {cfg?.rotator?.accounts && cfg.rotator.accounts.map((acc, idx) => {
                                        const getQuota = (modelPart: string) => {
                                             const key = Object.keys(accountStatus).find(k => k.startsWith(acc) && k.includes(modelPart));
                                             return key ? accountStatus[key] : -1;
                                        };
                                        const qPro = getQuota("gemini-3-pro-high");
                                        const qFlash = getQuota("gemini-3-flash");
                                        const qClaude = getQuota("claude-sonnet-4-5");

                                        const renderCell = (val: number) => {
                                            if (val === -1) return <span className="text-slate-400 font-bold">--</span>;
                                            if (val === 0) return <span className="text-rose-500 font-bold">0%</span>;
                                            if (val < 20) return <span className="text-amber-500 font-bold">{val}%</span>;
                                            return <span className="text-emerald-500 font-bold">{val}%</span>;
                                        };

                                        return (
                                            <tr key={acc} className={`border-b transition-colors ${t.border} ${theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-slate-50'} ${acc === vipEmail ? (theme === 'dark' ? 'bg-blue-600/5' : 'bg-blue-50') : idx % 2 === 0 ? (theme === 'dark' ? 'bg-white/[0.02]' : 'bg-white') : (theme === 'dark' ? '' : 'bg-slate-50/30')}`}>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-2 h-2 rounded-full ${acc === vipEmail ? 'bg-blue-500 animate-pulse' : 'bg-slate-400'}`} />
                                                        <span className={`truncate font-bold ${acc === vipEmail ? 'text-blue-500' : ''}`}>{acc}</span>
                                                        {acc === vipEmail && <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded font-bold">MAIN</span>}
                                                    </div>
                                                </td>
                                                <td className={`p-4 text-center border-l ${t.border}`}>{renderCell(qPro)}</td>
                                                <td className={`p-4 text-center border-l ${t.border}`}>{renderCell(qFlash)}</td>
                                                <td className={`p-4 text-center border-l ${t.border}`}>{renderCell(qClaude)}</td>
                                                <td className={`p-4 text-right border-l ${t.border}`}>
                                                    {acc !== vipEmail && (
                                                        <button 
                                                            onClick={() => handleSwitchAccount(acc)}
                                                            className="text-xs font-bold text-slate-400 hover:text-blue-500 uppercase tracking-wider hover:underline"
                                                        >
                                                            Promote to Main
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;
