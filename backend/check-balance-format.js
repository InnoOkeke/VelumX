
async function checkBalance() {
    const userAddress = 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P'; // Mentioned by user as having balance
    const rpcUrl = 'https://api.testnet.hiro.so';

    try {
        const response = await fetch(`${rpcUrl}/extended/v1/address/${userAddress}/balances`);
        const data = await response.json();
        console.log('Fungible Tokens Keys:', Object.keys(data.fungible_tokens || {}));
        console.log('Sample Data:', JSON.stringify(data.fungible_tokens, null, 2).substring(0, 500));
    } catch (e) {
        console.error(e);
    }
}

checkBalance();
