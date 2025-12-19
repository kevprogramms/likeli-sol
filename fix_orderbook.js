const fs = require('fs');
const path = '/Users/kevinisaac/Downloads/likeli-new-sol-main/likeli-contracts/programs/likeli-contracts/src/lib.rs';
let content = fs.readFileSync(path, 'utf8');

const searchRegex = /#\[account\(\s+mut,\s+seeds = \[b"orderbook", market\.key\(\)\.as_ref\(\)\],\s+bump\s+\)\]\s+pub orderbook: Account<'info, Orderbook>,/g;

const replacement = `#[account(
        init_if_needed,
        payer = buyer_or_owner,
        space = 8 + Orderbook::INIT_SPACE,
        seeds = [b"orderbook", market.key().as_ref()],
        bump
    )]
    pub orderbook: Account<'info, Orderbook>,`;

// We need to handle the fact that payer might be 'buyer' or 'owner'
// Let's do it more surgically

// 1. BuyShares (payer = buyer)
content = content.replace(/pub struct BuyShares<[^>]*> \{[\s\S]*?#\[account\(\s+mut,\s+seeds = \[b"orderbook", market\.key\(\)\.as_ref\(\)\],\s+bump\s+\)\]\s+pub orderbook: Account<'info, Orderbook>,/g, (match) => {
    return match.replace(/mut,/, 'init_if_needed,\n        payer = buyer,\n        space = 8 + Orderbook::INIT_SPACE,');
});

// 2. BuyMulti (payer = buyer)
content = content.replace(/pub struct BuyMulti<[^>]*> \{[\s\S]*?#\[account\(\s+mut,\s+seeds = \[b"orderbook", market\.key\(\)\.as_ref\(\)\],\s+bump\s+\)\]\s+pub orderbook: Account<'info, Orderbook>,/g, (match) => {
    return match.replace(/mut,/, 'init_if_needed,\n        payer = buyer,\n        space = 8 + Orderbook::INIT_SPACE,');
});

// 3. PlaceOrder (payer = owner)
content = content.replace(/pub struct PlaceOrder<[^>]*> \{[\s\S]*?#\[account\(\s+mut,\s+seeds = \[b"orderbook", market\.key\(\)\.as_ref\(\)\],\s+bump\s+\)\]\s+pub orderbook: Account<'info, Orderbook>,/g, (match) => {
    return match.replace(/mut,/, 'init_if_needed,\n        payer = owner,\n        space = 8 + Orderbook::INIT_SPACE,');
});

// 4. PlaceMultiOrder (payer = owner)
content = content.replace(/pub struct PlaceMultiOrder<[^>]*> \{[\s\S]*?#\[account\(\s+mut,\s+seeds = \[b"orderbook", market\.key\(\)\.as_ref\(\)\],\s+bump\s+\)\]\s+pub orderbook: Account<'info, Orderbook>,/g, (match) => {
    return match.replace(/mut,/, 'init_if_needed,\n        payer = owner,\n        space = 8 + Orderbook::INIT_SPACE,');
});

fs.writeFileSync(path, content);
console.log('Successfully updated orderbook accounts');
