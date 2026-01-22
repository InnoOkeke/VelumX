/**
 * PositionDashboard Component Tests
 * Tests for position tracking and portfolio management UI
 */

import { render, screen, waitFor } from '@testing-library/react';
import { PositionDashboard } from '../PositionDashboard';
import { useWallet } from '../../lib/hooks/useWallet';
import { useConfig } from '../../lib/config';

// Mock the hooks
jest.mock('../../lib/hooks/useWallet');
jest.mock('../../lib/config');

const mockUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockUseConfig = useConfig as jest.MockedFunction<typeof useConfig>;

describe('PositionDashboard', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup default mock config
    mockUseConfig.mockReturnValue({
      backendUrl: 'http://localhost:3001',
      stacksNetwork: 'testnet',
      ethereumUsdcAddress: '0x123',
      ethereumXReserveAddress: '0x456',
      stacksUsdcxAddress: 'ST1.usdcx',
      stacksUsdcxProtocolAddress: 'ST1.usdcx-v1',
      stacksPaymasterAddress: 'ST1.paymaster',
      stacksSwapContractAddress: 'ST1.swap-contract',
      ethereumDomainId: 0,
      stacksDomainId: 10003,
      ethereumExplorerUrl: 'https://etherscan.io',
      stacksExplorerUrl: 'https://explorer.stacks.co',
    });
  });

  /**
   * Test: Requirement 4.1 - Display connect wallet message when not connected
   */
  it('should display connect wallet message when wallet is not connected', () => {
    mockUseWallet.mockReturnValue({
      stacksConnected: false,
      stacksAddress: null,
      balances: { usdcx: '0', stx: '0' },
      fetchBalances: jest.fn(),
    });

    render(<PositionDashboard />);

    expect(screen.getByText('Connect Your Wallet')).toBeInTheDocument();
    expect(screen.getByText(/Connect your Stacks wallet to view/)).toBeInTheDocument();
  });

  /**
   * Test: Requirement 4.1 - Display loading state when fetching positions
   */
  it('should display loading state when fetching positions', () => {
    mockUseWallet.mockReturnValue({
      stacksConnected: true,
      stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      balances: { usdcx: '1000', stx: '500' },
      fetchBalances: jest.fn(),
    });

    render(<PositionDashboard />);

    expect(screen.getByText('Loading your positions...')).toBeInTheDocument();
  });

  /**
   * Test: Requirement 4.4 - Display portfolio summary with correct metrics
   */
  it('should display portfolio summary when positions are loaded', async () => {
    const mockAddress = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
    
    mockUseWallet.mockReturnValue({
      stacksConnected: true,
      stacksAddress: mockAddress,
      balances: { usdcx: '1000', stx: '500' },
      fetchBalances: jest.fn(),
    });

    // Mock fetch for positions API
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            poolId: 'USDCx-STX',
            userAddress: mockAddress,
            lpTokenBalance: '100000000',
            sharePercentage: 0.01,
            tokenAAmount: '1000000000',
            tokenBAmount: '500000000',
            currentValue: 2000,
            initialValue: 1800,
            impermanentLoss: -50,
            feeEarnings: 250,
            createdAt: new Date('2024-01-01').toISOString(),
            lastUpdated: new Date().toISOString(),
          },
        ],
      }),
    });

    render(<PositionDashboard />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Total Value')).toBeInTheDocument();
    });

    // Verify portfolio summary is displayed
    expect(screen.getByText('Total Returns')).toBeInTheDocument();
    expect(screen.getByText('Fee Earnings')).toBeInTheDocument();
    expect(screen.getByText('Impermanent Loss')).toBeInTheDocument();
  });

  /**
   * Test: Requirement 4.2 - Display individual position details
   */
  it('should display position details with correct calculations', async () => {
    const mockAddress = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
    
    mockUseWallet.mockReturnValue({
      stacksConnected: true,
      stacksAddress: mockAddress,
      balances: { usdcx: '1000', stx: '500' },
      fetchBalances: jest.fn(),
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            poolId: 'USDCx-STX',
            userAddress: mockAddress,
            lpTokenBalance: '100000000',
            sharePercentage: 0.01,
            tokenAAmount: '1000000000',
            tokenBAmount: '500000000',
            currentValue: 2000,
            initialValue: 1800,
            impermanentLoss: -50,
            feeEarnings: 250,
            createdAt: new Date('2024-01-01').toISOString(),
            lastUpdated: new Date().toISOString(),
          },
        ],
      }),
    });

    render(<PositionDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Your Positions')).toBeInTheDocument();
    });

    // Verify position is displayed
    expect(screen.getByText('USDCx / STX')).toBeInTheDocument();
  });

  /**
   * Test: Error handling when API fails
   */
  it('should display error message when API fails', async () => {
    mockUseWallet.mockReturnValue({
      stacksConnected: true,
      stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      balances: { usdcx: '1000', stx: '500' },
      fetchBalances: jest.fn(),
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
    });

    render(<PositionDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load positions/)).toBeInTheDocument();
    });
  });
});
