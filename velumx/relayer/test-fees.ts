import { PaymasterService } from './src/PaymasterService.js';
import dotenv from 'dotenv';
dotenv.config();

async function testFees() {
    const paymaster = new PaymasterService();
    // Simulate a request for USDCx
    const usdcx = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
    const alex = 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex';

    console.log("--- Estimating USDCx Fee ---");
    const e1 = await (paymaster as any).calculateUniversalFee(usdcx);
    console.log("USDCx Estimate:", e1);
    
    console.log("\n--- Estimating ALEX Fee ---");
    const e2 = await (paymaster as any).calculateUniversalFee(alex);
    console.log("ALEX Estimate:", e2);

    process.exit(0);
}

// We need to expose the private method for testing or mock the entry point
// For now, let's just mock the logic or check if we can call it.
// Actually, I'll just look at the code.
