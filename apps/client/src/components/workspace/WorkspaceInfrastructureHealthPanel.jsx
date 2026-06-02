import { useState, useEffect } from 'react';
import AppIcon from '../AppIcon';
import { getInfrastructureHealth, sweepOrphans } from '../../services/workspaceApi';

export default function WorkspaceInfrastructureHealthPanel() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sweepState, setSweepState] = useState('idle'); // idle, sweeping, done

  const fetchHealth = async () => {
    try {
      const res = await getInfrastructureHealth();
      if (res?.success) {
        setHealth(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch infrastructure health', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSweepOrphans = async () => {
    setSweepState('sweeping');
    try {
      const res = await sweepOrphans();
      if (res?.success) {
        setSweepState('done');
      } else {
        setSweepState('idle');
      }
      setTimeout(() => setSweepState('idle'), 3000);
    } catch (err) {
      console.error('Failed to sweep orphans', err);
      setSweepState('idle');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 bg-white border border-slate-200/60 shadow-sm rounded-2xl animate-pulse">
        <AppIcon name="loader" size={16} className="animate-spin text-orange-600" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-2">Loading Infrastructure Diagnostics...</span>
      </div>
    );
  }

  const isQdrantHealthy = health?.qdrant?.healthy ?? false;
  const deferredQueueSize = health?.qdrant?.queueSize ?? 0;

  return (
    <div className="bg-white border border-slate-200/60 shadow-sm shadow-slate-100/5 rounded-2xl p-5 space-y-5 transition duration-300 hover:border-slate-300 relative overflow-hidden group">
      {/* Background glow */}
      <div className="absolute -top-12 -right-12 w-28 h-28 bg-orange-500/5 rounded-full blur-2xl -z-10 group-hover:bg-orange-500/8" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg border ${
            isQdrantHealthy ? 'bg-orange-50 border-orange-100/50 text-orange-600' : 'bg-rose-50 border-rose-100 text-rose-600'
          }`}>
            <AppIcon name="database" size={12} />
          </div>
          <div>
            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block">SheryAI Cloud Diagnostics</span>
            <h4 className="text-[11px] font-extrabold text-slate-800 uppercase tracking-wider leading-tight">Infrastructure Health Overwatch</h4>
          </div>
        </div>

        <button
          onClick={fetchHealth}
          className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-850 hover:bg-slate-100 transition active:scale-95"
          title="Refresh Diagnostics"
        >
          <AppIcon name="refresh" size={10} className="animate-spin-slow" />
        </button>
      </div>

      {/* Active Service Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Qdrant Status */}
        <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-3 space-y-1.5">
          <div className="flex justify-between items-center text-[8px] font-black text-slate-450 uppercase tracking-wider">
            <span>Vector DB</span>
            <span className={`w-1.5 h-1.5 rounded-full ${isQdrantHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          </div>
          <span className="text-[12px] font-black text-slate-800 uppercase tracking-tight block">Qdrant Host</span>
          <span className="text-[8px] font-bold text-slate-500 block leading-none truncate">
            {isQdrantHealthy ? 'Healthy (127.0.0.1:6333)' : 'Offline / Degraded'}
          </span>
        </div>

        {/* NVIDIA NIM */}
        <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-3 space-y-1.5">
          <div className="flex justify-between items-center text-[8px] font-black text-slate-455 uppercase tracking-wider">
            <span>Primary Embedding</span>
            <span className={`w-1.5 h-1.5 rounded-full ${health?.nvidiaNIM?.configured ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          </div>
          <span className="text-[12px] font-black text-slate-800 uppercase tracking-tight block">NVIDIA NIM</span>
          <span className="text-[8px] font-bold text-slate-500 block leading-none">
            {health?.nvidiaNIM?.configured ? 'Configured & Active' : 'Unconfigured fallback active'}
          </span>
        </div>

        {/* OpenAI Fallback */}
        <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-3 space-y-1.5">
          <div className="flex justify-between items-center text-[8px] font-black text-slate-455 uppercase tracking-wider">
            <span>Failover Provider</span>
            <span className={`w-1.5 h-1.5 rounded-full ${health?.openai?.configured ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          </div>
          <span className="text-[12px] font-black text-slate-800 uppercase tracking-tight block">OpenAI API</span>
          <span className="text-[8px] font-bold text-slate-500 block leading-none">
            {health?.openai?.configured ? 'Healthy failover' : 'Unconfigured / Local fallback'}
          </span>
        </div>
      </div>

      {/* Background Queues & Deferred Jobs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Background Queues */}
        <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-4 space-y-3">
          <h5 className="text-[9px] font-black text-slate-800 uppercase tracking-wider">Active BullMQ Workers</h5>
          <div className="space-y-2 text-[9px] font-semibold text-slate-650">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Ingestion Queue (PDF/Youtube/Text)</span>
              <span className="text-slate-800 font-extrabold">
                {health?.queues?.ingestion?.active ?? 0} active / {health?.queues?.ingestion?.waiting ?? 0} waiting
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Local Video Upload Queue</span>
              <span className="text-slate-800 font-extrabold">
                {health?.queues?.videoUpload?.active ?? 0} active / {health?.queues?.videoUpload?.waiting ?? 0} waiting
              </span>
            </div>
          </div>
        </div>

        {/* Deferred Queue Stats */}
        <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <h5 className="text-[9px] font-black text-slate-800 uppercase tracking-wider">Deferred Indexing Queue</h5>
            {deferredQueueSize > 0 && (
              <span className="text-[7px] bg-orange-50 border border-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-extrabold uppercase animate-pulse">
                Flushing
              </span>
            )}
          </div>
          <div className="flex justify-between items-end mt-2">
            <div>
              <span className="text-[16px] font-black text-slate-800 leading-none block">{deferredQueueSize}</span>
              <span className="text-[8px] text-slate-500 block mt-0.5">Deferred un-indexed source shards</span>
            </div>

            <button
              onClick={handleSweepOrphans}
              disabled={sweepState === 'sweeping'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-slate-200 hover:border-slate-350 hover:bg-slate-100 text-[9px] font-black text-slate-500 hover:text-slate-800 rounded-lg transition duration-150 disabled:opacity-50"
            >
              <AppIcon name={sweepState === 'sweeping' ? 'loader' : 'trash'} size={9} className={sweepState === 'sweeping' ? 'animate-spin' : ''} />
              <span>
                {sweepState === 'sweeping' ? 'Sweeping...' : sweepState === 'done' ? 'Storage Swept!' : 'Sweep Orphan Files'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Hashing local fallback warning alerts */}
      {!health?.nvidiaNIM?.configured && !health?.openai?.configured && (
        <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-xl p-3.5 space-y-1 leading-relaxed text-[9px] font-semibold">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
            <AppIcon name="alert" size={10} />
            <span>Emergency Zero-Dependency Local Indexing Engine Active</span>
          </div>
          <p className="text-amber-800/80 font-normal leading-normal">
            No active API credentials found for Nvidia NIM or OpenAI. SheryAI Ingestion is running in local failover mode, hashing text segments deterministically to 1024-dimension float projections. Semantic grounding and BM25 chat remain fully operational.
          </p>
        </div>
      )}
    </div>
  );
}

