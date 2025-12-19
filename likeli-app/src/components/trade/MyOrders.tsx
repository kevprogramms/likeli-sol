// components/trade/MyOrders.tsx
// Shows user's open limit orders with fill history

'use client';

import { useState, useEffect } from 'react';
import { Clock, X, CheckCircle, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

interface MyOrdersProps {
    marketId: string;
    userId?: string;
    onOrderCancelled?: () => void;
}

interface LimitOrder {
    id: string;
    outcome: 'YES' | 'NO';
    limitProb: number;
    orderAmount: number;
    amount: number; // Filled amount
    shares: number; // Filled shares
    isFilled: boolean;
    isCancelled: boolean;
    createdTime: number;
    expiresAt?: number;
    fills: Array<{
        matchedBetId: string | null;
        amount: number;
        shares: number;
        timestamp: number;
    }>;
}

export default function MyOrders({ marketId, userId = 'demo-user', onOrderCancelled }: MyOrdersProps) {
    const [orders, setOrders] = useState<LimitOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState<string | null>(null);

    const fetchOrders = async () => {
        try {
            const res = await fetch(`/api/manifold/orders?contractId=${marketId}&userId=${userId}&t=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                setOrders(data.orders || []);
            }
        } catch (e) {
            console.error('Failed to fetch orders', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
        // Poll for updates every 5 seconds
        const interval = setInterval(fetchOrders, 5000);
        return () => clearInterval(interval);
    }, [marketId, userId]);

    const handleCancel = async (orderId: string) => {
        setCancelling(orderId);
        try {
            const res = await fetch(`/api/manifold/orders/${orderId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });

            if (res.ok) {
                setOrders(orders.filter(o => o.id !== orderId));
                onOrderCancelled?.();
            } else {
                const data = await res.json();
                alert('Failed to cancel: ' + (data.error || 'Unknown error'));
            }
        } catch (e) {
            console.error('Cancel error', e);
            alert('Failed to cancel order');
        } finally {
            setCancelling(null);
        }
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getTimeRemaining = (expiresAt: number) => {
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) return 'Expired';
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    if (loading) {
        return (
            <div className="p-4 text-center text-[var(--text-muted)] text-xs">
                Loading orders...
            </div>
        );
    }

    if (orders.length === 0) {
        return (
            <div className="p-4 text-center text-[var(--text-muted)] text-xs">
                No open orders
            </div>
        );
    }

    return (
        <div className="divide-y divide-[var(--border-subtle)]">
            {orders.map(order => {
                const fillPercent = order.orderAmount > 0
                    ? ((order.amount / order.orderAmount) * 100).toFixed(0)
                    : '0';
                const unfilled = order.orderAmount - order.amount;
                const isExpired = order.expiresAt && order.expiresAt < Date.now();

                return (
                    <div
                        key={order.id}
                        className={clsx(
                            "p-3 hover:bg-[var(--bg-panel-hover)] transition-colors",
                            isExpired && "opacity-50"
                        )}
                    >
                        {/* Order Header */}
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <span className={clsx(
                                    "text-xs font-bold px-2 py-0.5 rounded",
                                    order.outcome === 'YES'
                                        ? "bg-emerald-100 text-emerald-700"
                                        : "bg-red-100 text-red-700"
                                )}>
                                    {order.outcome}
                                </span>
                                <span className="text-sm font-mono text-[var(--text-main)]">
                                    @ {(order.limitProb * 100).toFixed(0)}¢
                                </span>
                            </div>

                            {/* Cancel Button */}
                            {!order.isFilled && !order.isCancelled && !isExpired && (
                                <button
                                    onClick={() => handleCancel(order.id)}
                                    disabled={cancelling === order.id}
                                    className="p-1 rounded hover:bg-red-100 text-[var(--text-muted)] hover:text-red-500 transition-colors"
                                    title="Cancel order"
                                >
                                    {cancelling === order.id ? (
                                        <div className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                                    ) : (
                                        <X size={14} />
                                    )}
                                </button>
                            )}
                        </div>

                        {/* Amount & Fill Progress */}
                        <div className="flex items-center gap-2 mb-2">
                            <div className="flex-1 bg-[var(--bg-input)] rounded-full h-2 overflow-hidden">
                                <div
                                    className={clsx(
                                        "h-full transition-all",
                                        order.outcome === 'YES' ? "bg-emerald-500" : "bg-red-500"
                                    )}
                                    style={{ width: `${fillPercent}%` }}
                                />
                            </div>
                            <span className="text-[10px] text-[var(--text-muted)] w-12 text-right">
                                {fillPercent}% filled
                            </span>
                        </div>

                        {/* Order Details */}
                        <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                            <div className="flex items-center gap-3">
                                <span>
                                    ${order.amount.toFixed(2)} / ${order.orderAmount.toFixed(2)}
                                </span>
                                <span>
                                    {order.shares.toFixed(2)} shares
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                {order.expiresAt && (
                                    <span className="flex items-center gap-1">
                                        <Clock size={10} />
                                        {getTimeRemaining(order.expiresAt)}
                                    </span>
                                )}
                                <span>{formatTime(order.createdTime)}</span>
                            </div>
                        </div>

                        {/* Fill History (expandable) */}
                        {order.fills.length > 0 && (
                            <details className="mt-2">
                                <summary className="text-[10px] text-[var(--color-primary)] cursor-pointer hover:underline">
                                    {order.fills.length} fill{order.fills.length > 1 ? 's' : ''}
                                </summary>
                                <div className="mt-1 space-y-1 pl-2 border-l-2 border-[var(--border-subtle)]">
                                    {order.fills.map((fill, i) => (
                                        <div key={i} className="text-[10px] text-[var(--text-muted)] flex justify-between">
                                            <span>
                                                {fill.matchedBetId === null ? '📊 AMM' : '👤 Maker'}
                                            </span>
                                            <span>${fill.amount.toFixed(2)} → {fill.shares.toFixed(2)} shares</span>
                                            <span>{formatTime(fill.timestamp)}</span>
                                        </div>
                                    ))}
                                </div>
                            </details>
                        )}

                        {/* Status Icons */}
                        {order.isFilled && (
                            <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-500">
                                <CheckCircle size={12} />
                                <span>Fully filled</span>
                            </div>
                        )}
                        {isExpired && !order.isFilled && (
                            <div className="mt-2 flex items-center gap-1 text-[10px] text-amber-500">
                                <AlertCircle size={12} />
                                <span>Expired - refund pending</span>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
