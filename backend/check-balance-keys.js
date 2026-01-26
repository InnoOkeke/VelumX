
async function checkBalance() {
    const userAddress = 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P';
    const rpcUrl = 'https://api.testnet.hiro.so';

    try {
        const response = await fetch(`${rpcUrl}/extended/v1/address/${userAddress}/balances`);
        const data = await response.json();
        console.log('Fungible Token Keys:');
        Object.keys(data.fungible_tokens || {}).forEach(key => {
            console.log(`- ${key}`);
        });
    } catch (e) {
        console.error(e);
    }
}

checkBalance();
