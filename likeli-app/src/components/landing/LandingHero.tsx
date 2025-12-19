"use client";

import { useEffect, useState } from "react";
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton";
import { Sparkles, TrendingUp, ShieldCheck, Zap } from "lucide-react";
import styles from "@/app/page.module.css"; // Reuse existing or valid styles

export default function LandingHero() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden" style={{
            background: 'radial-gradient(circle at 50% 50%, rgba(230, 57, 70, 0.15) 0%, rgba(248, 249, 251, 0) 60%)',
        }}>

            {/* Background Blob Animations */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div
                    className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] rounded-full blur-[100px] opacity-30 animate-pulse"
                    style={{ background: 'linear-gradient(135deg, #E63946 0%, #FCA5A5 100%)' }}
                />
                <div
                    className="absolute bottom-[-10%] right-[10%] w-[600px] h-[600px] rounded-full blur-[120px] opacity-25 animate-pulse"
                    style={{ background: 'linear-gradient(135deg, #E63946 0%, #EF4444 100%)', animationDelay: '2s' }}
                />
            </div>

            {/* Content Container */}
            <div className="relative z-10 max-w-4xl px-6 text-center">

                {/* Badge */}
                <div
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8 border border-red-200 bg-red-50/80 backdrop-blur-sm text-red-600 font-bold text-sm transition-all duration-700 transform ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                    style={{ boxShadow: '0 4px 12px rgba(230, 57, 70, 0.1)' }}
                >
                    <Sparkles size={14} className="animate-pulse" />
                    <span>Likeli • Live on Solana Devnet</span>
                </div>

                {/* Main Headline */}
                <h1
                    className={`text-6xl md:text-8xl font-black tracking-tighter mb-6 text-slate-900 transition-all duration-700 delay-100 transform ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                    style={{ lineHeight: 1.0 }}
                >
                    Likeli<span className="text-red-500">.</span>
                </h1>

                <h2
                    className={`text-4xl md:text-5xl font-bold tracking-tight mb-8 text-slate-700 transition-all duration-700 delay-150 transform ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                >
                    Predict the <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-500">Future</span>
                </h2>

                {/* Subheadline */}
                <p
                    className={`text-xl text-slate-500 mb-10 max-w-2xl mx-auto leading-relaxed transition-all duration-700 delay-200 transform ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                >
                    Trade on the outcome of real-world events.
                    <br className="hidden md:block" />
                    Instant liquidity, decentralized resolution, and 100% on-chain.
                </p>

                {/* CTA Area */}
                <div
                    className={`flex flex-col items-center gap-4 transition-all duration-700 delay-300 transform ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                >
                    <div className="p-1 rounded-2xl bg-gradient-to-r from-red-100 to-blue-100 shadow-xl">
                        <div className="bg-white rounded-xl p-8 border border-slate-100 min-w-[320px]">
                            <p className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider">Start Trading</p>
                            <ConnectWalletButton />
                            <p className="text-xs text-slate-400 mt-4">
                                Supports Phantom, Solflare & Backpack
                            </p>
                        </div>
                    </div>
                </div>

                {/* Features Grid */}
                <div
                    className={`grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 text-left transition-all duration-700 delay-500 transform ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                >
                    <div className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500 mb-4">
                            <Zap size={20} />
                        </div>
                        <h3 className="font-bold text-slate-900 mb-2">Instant Trading</h3>
                        <p className="text-sm text-slate-500">Lightning fast execution on Solana. No waiting for order matches.</p>
                    </div>
                    <div className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center text-green-500 mb-4">
                            <TrendingUp size={20} />
                        </div>
                        <h3 className="font-bold text-slate-900 mb-2">Deep Liquidity</h3>
                        <p className="text-sm text-slate-500">Automated Market Makers ensure you can always buy or sell your position.</p>
                    </div>
                    <div className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-500 mb-4">
                            <ShieldCheck size={20} />
                        </div>
                        <h3 className="font-bold text-slate-900 mb-2">Trustless</h3>
                        <p className="text-sm text-slate-500">Resolutions powered by decentralized oracles and AI agents.</p>
                    </div>
                </div>

            </div>
        </div>
    );
}
