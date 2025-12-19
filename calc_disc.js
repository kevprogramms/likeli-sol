const crypto = require('crypto');

function getDiscriminator(name) {
    const hash = crypto.createHash('sha256').update(`global:${name}`).digest();
    return Array.from(hash.slice(0, 8));
}

console.log("rebalance_market:", JSON.stringify(getDiscriminator("rebalance_market")));
console.log("set_multi_market_config:", JSON.stringify(getDiscriminator("set_multi_market_config")));
