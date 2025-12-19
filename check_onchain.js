
const { Connection, PublicKey } = require("@solana/web3.js");
const { Program, AnchorProvider } = require("@coral-xyz/anchor");
const idl = require("./likeli-app/src/idl/likeli_contracts.json");

async function checkMarkets() {
    const connection = new Connection("https://api.devnet.solana.com");
    const programId = new PublicKey("8psUrun5yBN4aW655P3fuej3pCMNUvsBFqptoAG89RXc");

    // Create a dummy provider
    const provider = {
        connection,
        publicKey: PublicKey.default,
    };

    const program = new Program(idl, programId, provider);

    try {
        const markets = await program.account.market.all();
        console.log(`Found ${markets.length} binary markets`);

        const multiMarkets = await program.account.multiMarket.all();
        console.log(`Found ${multiMarkets.length} multi-markets`);

        const answers = await program.account.answer.all();
        console.log(`Found ${answers.length} answers`);

    } catch (e) {
        console.error("Error fetching markets:", e);
    }
}

checkMarkets();
