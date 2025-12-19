// components/Orderbook.tsx
// Real-time order book display for Likeli markets

'use client';

import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { Program, AnchorProvider } from '@project-serum/anchor';
import { useState } from 'react';

interface OrderbookProps {
  marketId: string;
}

interface Order {
  pubkey: PublicKey;
  owner: PublicKey;
  market: PublicKey;
  price: number; // Already converted from basis points
  qty: number;
  filledQty: number;
  isYes: boolean;
  isBid: boolean;
  createdAt: number;
  expiresAt: number | null;
}

export default function Orderbook({ marketId }: OrderbookProps) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);

  // Fetch orderbook data
  const { data: orderbook, isLoading } = useQuery({
    queryKey: ['orderbook', marketId],
    queryFn: async () => {
      try {
        // Get program instance (you'll need to adjust based on your setup)
        const program = getProgram(connection);
        
        // Fetch orderbook account
        const [orderbookPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('orderbook'), new PublicKey(marketId).toBuffer()],
          program.programId
        );
        
        const orderbookData = await program.account.orderbook.fetch(orderbookPda);
        
        // Fetch all orders in parallel
        const [yesBuyOrders, yesSellOrders, noBuyOrders, noSellOrders] = await Promise.all([
          fetchOrders(program, orderbookData.yesBuyOrders),
          fetchOrders(program, orderbookData.yesSellOrders),
          fetchOrders(program, orderbookData.noBuyOrders),
          fetchOrders(program, orderbookData.noSellOrders),
        ]);
        
        return {
          yesBuy: yesBuyOrders,
          yesSell: yesSellOrders,
          noBuy: noBuyOrders,
          noSell: noSellOrders,
        };
      } catch (error) {
        console.error('Failed to fetch orderbook:', error);
        return { yesBuy: [], yesSell: [], noBuy: [], noSell: [] };
      }
    },
    refetchInterval: 2000, // Real-time updates every 2 seconds
  });

  if (isLoading) {
    return (
      <div className="orderbook-loading">
        <div className="spinner" />
        <p>Loading orderbook...</p>
      </div>
    );
  }

  const handlePriceClick = (price: number) => {
    setSelectedPrice(price);
    // Optionally: pre-fill trade panel with this price
  };

  return (
    <div className="orderbook">
      {/* Header */}
      <div className="orderbook-header">
        <h3>Order Book</h3>
        <div className="orderbook-info">
          <span className="orderbook-spread">
            Spread: {calculateSpread(orderbook)}%
          </span>
        </div>
      </div>

      {/* YES Market */}
      <div className="orderbook-market">
        <div className="orderbook-market-title">YES</div>
        <div className="orderbook-sides">
          {/* BIDS (Buy YES) */}
          <div className="orderbook-side orderbook-bids">
            <div className="orderbook-column-headers">
              <span>Price</span>
              <span>Size</span>
              <span>Total</span>
            </div>
            <div className="orderbook-rows">
              {orderbook?.yesBuy
                .sort((a, b) => b.price - a.price) // Highest price first
                .slice(0, 20) // Show top 20
                .map((order) => (
                  <OrderRow
                    key={order.pubkey.toString()}
                    order={order}
                    side="buy"
                    isOwn={order.owner.equals(publicKey || PublicKey.default)}
                    onClick={() => handlePriceClick(order.price)}
                  />
                ))}
            </div>
          </div>

          {/* ASKS (Sell YES) */}
          <div className="orderbook-side orderbook-asks">
            <div className="orderbook-column-headers">
              <span>Price</span>
              <span>Size</span>
              <span>Total</span>
            </div>
            <div className="orderbook-rows">
              {orderbook?.yesSell
                .sort((a, b) => a.price - b.price) // Lowest price first
                .slice(0, 20)
                .map((order) => (
                  <OrderRow
                    key={order.pubkey.toString()}
                    order={order}
                    side="sell"
                    isOwn={order.owner.equals(publicKey || PublicKey.default)}
                    onClick={() => handlePriceClick(order.price)}
                  />
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* NO Market */}
      <div className="orderbook-market">
        <div className="orderbook-market-title">NO</div>
        <div className="orderbook-sides">
          <div className="orderbook-side orderbook-bids">
            <div className="orderbook-column-headers">
              <span>Price</span>
              <span>Size</span>
              <span>Total</span>
            </div>
            <div className="orderbook-rows">
              {orderbook?.noBuy
                .sort((a, b) => b.price - a.price)
                .slice(0, 20)
                .map((order) => (
                  <OrderRow
                    key={order.pubkey.toString()}
                    order={order}
                    side="buy"
                    isOwn={order.owner.equals(publicKey || PublicKey.default)}
                    onClick={() => handlePriceClick(order.price)}
                  />
                ))}
            </div>
          </div>

          <div className="orderbook-side orderbook-asks">
            <div className="orderbook-column-headers">
              <span>Price</span>
              <span>Size</span>
              <span>Total</span>
            </div>
            <div className="orderbook-rows">
              {orderbook?.noSell
                .sort((a, b) => a.price - b.price)
                .slice(0, 20)
                .map((order) => (
                  <OrderRow
                    key={order.pubkey.toString()}
                    order={order}
                    side="sell"
                    isOwn={order.owner.equals(publicKey || PublicKey.default)}
                    onClick={() => handlePriceClick(order.price)}
                  />
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper component for individual order rows
function OrderRow({
  order,
  side,
  isOwn,
  onClick,
}: {
  order: Order;
  side: 'buy' | 'sell';
  isOwn: boolean;
  onClick: () => void;
}) {
  const remainingQty = order.qty - order.filledQty;
  const total = (order.price / 100) * remainingQty;
  
  // Check if expired
  const isExpired = order.expiresAt && order.expiresAt < Date.now() / 1000;

  return (
    <div
      className={`orderbook-row ${side} ${isOwn ? 'own' : ''} ${isExpired ? 'expired' : ''}`}
      onClick={onClick}
    >
      <span className="orderbook-price">{(order.price / 100).toFixed(1)}%</span>
      <span className="orderbook-size">{remainingQty}</span>
      <span className="orderbook-total">${total.toFixed(2)}</span>
    </div>
  );
}

// Helper functions
async function fetchOrders(program: Program, orderPubkeys: PublicKey[]): Promise<Order[]> {
  if (orderPubkeys.length === 0) return [];
  
  try {
    const orders = await Promise.all(
      orderPubkeys.map(async (pubkey) => {
        const orderData = await program.account.limitOrder.fetch(pubkey);
        return {
          pubkey,
          ...orderData,
          price: orderData.price, // Keep as basis points for now, convert in UI
        };
      })
    );
    
    // Filter out expired orders
    const now = Date.now() / 1000;
    return orders.filter(o => !o.expiresAt || o.expiresAt > now);
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}

function calculateSpread(orderbook: any): string {
  if (!orderbook) return '0.0';
  
  const bestBid = orderbook.yesBuy[0]?.price || 0;
  const bestAsk = orderbook.yesSell[0]?.price || 10000;
  
  const spread = ((bestAsk - bestBid) / 100).toFixed(1);
  return spread;
}

function getProgram(connection: any): Program {
  // TODO: Implement based on your anchor setup
  // This is a placeholder
  throw new Error('getProgram not implemented');
}
