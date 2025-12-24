import React, { useCallback, useState, useEffect } from 'react';
import { ethers } from 'ethers';
import detectEthereumProvider from '@metamask/detect-provider';

// ABIs
import MyTokenABI from './contracts/MyToken.json';
import StableCoinABI from './contracts/StableCoin.json';
import SimplePoolABI from './contracts/SimplePool.json';

const ADDRESSES = {
  myToken: process.env.REACT_APP_MY_TOKEN_ADDRESS || '',
  usdt: process.env.REACT_APP_USDT_ADDRESS || '',
  pool: process.env.REACT_APP_POOL_ADDRESS || '',
};

const INITIAL_INPUTS = { addMtk: '', addUsdt: '', swapMtk: '', swapUsdt: '', removeLp: '' };

function App() {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [contracts, setContracts] = useState({ pool: null, mtk: null, usdt: null });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [balances, setBalances] = useState({ mtk: '0', usdt: '0', lp: '0', rMtk: '0', rUsdt: '0' });
  const [poolState, setPoolState] = useState({ resMtk: '0', resUsdt: '0', totalLp: '0', fee: 0 });
  const [inputs, setInputs] = useState(INITIAL_INPUTS);

  // --- Transaction Helper ---
  const handleTransaction = async (label, txFunc) => {
    setLoading(true);
    setStatus({ type: 'info', message: `Confirming ${label}...` });
    try {
      const tx = await txFunc();
      setStatus({ type: 'info', message: `Mining ${label} on blockchain...` });
      await tx.wait();
      
      setStatus({ type: 'success', message: `${label} Successful!` });
      setInputs(INITIAL_INPUTS); // CLEAR FORM
      await refreshData();
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: err.reason || err.message || "Action Failed" });
    } finally {
      setLoading(false);
    }
  };

  const refreshData = useCallback(async () => {
    if (!contracts.pool || !account) return;
    try {
      const [resMtk, resUsdt, totalLp, feeBps, mtkBal, usdtBal, userInfo, rewards] = await Promise.all([
        contracts.pool.reserveMyToken(),
        contracts.pool.reserveUSDT(),
        contracts.pool.totalLiquidity(),
        contracts.pool.swapFeeBps(),
        contracts.mtk.balanceOf(account),
        contracts.usdt.balanceOf(account),
        contracts.pool.users(account),
        contracts.pool.pendingRewards(account)
      ]);

      setPoolState({
        resMtk: ethers.formatEther(resMtk),
        resUsdt: ethers.formatEther(resUsdt),
        totalLp: ethers.formatEther(totalLp),
        fee: Number(feeBps) / 100
      });

      setBalances({
        mtk: ethers.formatEther(mtkBal),
        usdt: ethers.formatEther(usdtBal),
        lp: ethers.formatEther(userInfo.shares),
        rMtk: ethers.formatEther(rewards[0]),
        rUsdt: ethers.formatEther(rewards[1])
      });
    } catch (err) { console.error("Refresh failed", err); }
  }, [contracts, account]);

  const connectWallet = async () => {
    try {
      const ethereum = await detectEthereumProvider();
      if (!ethereum) throw new Error("Please install MetaMask");
      const browserProvider = new ethers.BrowserProvider(ethereum);
      const signer = await browserProvider.getSigner();
      const addr = await signer.getAddress();
      setProvider(browserProvider);
      setAccount(addr);
      setContracts({
        pool: new ethers.Contract(ADDRESSES.pool, SimplePoolABI.abi, signer),
        mtk: new ethers.Contract(ADDRESSES.myToken, MyTokenABI.abi, signer),
        usdt: new ethers.Contract(ADDRESSES.usdt, StableCoinABI.abi, signer)
      });
      setStatus({ type: 'success', message: 'Wallet Connected' });
    } catch (err) { setStatus({ type: 'error', message: err.message }); }
  };

  const ensureApproval = async (token, amountWei) => {
    const allowance = await token.allowance(account, ADDRESSES.pool);
    if (allowance < amountWei) {
      setStatus({ type: 'info', message: 'Approving Token Spend...' });
      const tx = await token.approve(ADDRESSES.pool, amountWei);
      await tx.wait();
    }
  };

  // --- Actions ---
  const onAddLiquidity = () => handleTransaction("Add Liquidity", async () => {
    const mWei = ethers.parseEther(inputs.addMtk);
    const uWei = ethers.parseEther(inputs.addUsdt);
    await ensureApproval(contracts.mtk, mWei);
    await ensureApproval(contracts.usdt, uWei);
    return contracts.pool.addLiquidity(mWei, uWei);
  });

  const onSwap = (isMtk) => handleTransaction("Swap", async () => {
    const amt = ethers.parseEther(isMtk ? inputs.swapMtk : inputs.swapUsdt);
    await ensureApproval(isMtk ? contracts.mtk : contracts.usdt, amt);
    return isMtk ? contracts.pool.swapMyTokenForUSDT(amt) : contracts.pool.swapUSDTForMyToken(amt);
  });

  const onRemoveLiquidity = (all = false) => handleTransaction(all ? "Remove All" : "Remove Liquidity", async () => {
    let shares;
    if (all) {
      const userInfo = await contracts.pool.users(account);
      shares = userInfo.shares;
    } else {
      shares = ethers.parseEther(inputs.removeLp);
    }
    if (shares === 0n) throw new Error("No liquidity to remove");
    return contracts.pool.removeLiquidity(shares);
  });

  useEffect(() => { if (contracts.pool) refreshData(); }, [contracts, refreshData]);

  // --- UI Theme ---
  const theme = {
    primary: '#4F46E5', // Indigo
    accent: '#10B981', // Emerald
    danger: '#EF4444', // Rose
    text: '#111827',
    muted: '#6B7280',
    card: '#ffffff',
    bg: '#F9FAFB'
  };

  const cardStyle = {
    background: theme.card,
    padding: '24px',
    borderRadius: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.05)',
    border: '1px solid #E5E7EB',
    height: 'fit-content'
  };

  const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: '10px',
    border: '1px solid #D1D5DB', marginBottom: '10px', fontSize: '15px',
    boxSizing: 'border-box', outline: 'none'
  };

  const btnStyle = (bg, mb = '0') => ({
    backgroundColor: loading ? '#9CA3AF' : bg,
    color: 'white', border: 'none', padding: '14px', borderRadius: '10px',
    fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer',
    width: '100%', marginBottom: mb, transition: '0.2s opacity'
  });

  return (
    <div style={{ backgroundColor: theme.bg, minHeight: '100vh', padding: '40px 20px', fontFamily: 'Inter, system-ui', color: theme.text }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '32px', fontWeight: '800', color: theme.primary }}>Velvet Protocol</h1>
            <p style={{ margin: '4px 0 0 0', color: theme.muted }}>Institutional grade liquidity pool</p>
          </div>
          {account && (
            <div style={{ textAlign: 'right', background: 'white', padding: '8px 16px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
              <span style={{ fontSize: '12px', color: theme.muted, display: 'block' }}>Wallet Connected</span>
              <strong style={{ fontSize: '14px' }}>{account.substring(0, 6)}...{account.substring(account.length-4)}</strong>
            </div>
          )}
        </header>

        {status.message && (
          <div style={{ 
            marginBottom: '30px', padding: '16px', borderRadius: '12px', textAlign: 'center', fontWeight: '600',
            backgroundColor: status.type === 'error' ? '#FEF2F2' : (status.type === 'success' ? '#ECFDF5' : '#EEF2FF'),
            color: status.type === 'error' ? theme.danger : (status.type === 'success' ? theme.accent : theme.primary),
            border: `1px solid currentColor`
          }}>
            {status.message}
          </div>
        )}

        {!account ? (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '100px' }}>
            <h2 style={{ marginBottom: '20px' }}>Access the Dashboard</h2>
            <button onClick={connectWallet} style={{ ...btnStyle(theme.primary), width: '250px' }}>Connect MetaMask</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '30px' }}>
            
            {/* LEFT: INFO PANELS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>📊 Pool Analytics</h3>
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: theme.muted }}>Reserve MTK</span>
                    <strong>{parseFloat(poolState.resMtk).toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: theme.muted }}>Reserve USDT</span>
                    <strong>{parseFloat(poolState.resUsdt).toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid #F3F4F6' }}>
                    <span style={{ color: theme.muted }}>Trading Fee</span>
                    <strong style={{ color: theme.accent }}>{poolState.fee}%</strong>
                  </div>
                </div>
              </div>

              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>💰 Your Assets</h3>
                <div style={{ display: 'grid', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: theme.muted }}>MyToken Balance</span>
                    <strong>{parseFloat(balances.mtk).toFixed(4)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: theme.muted }}>USDT Balance</span>
                    <strong>{parseFloat(balances.usdt).toFixed(4)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: theme.muted }}>Pool Shares</span>
                    <strong>{parseFloat(balances.lp).toFixed(4)} LP</strong>
                  </div>
                </div>
                <div style={{ background: '#F9FAFB', padding: '16px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: theme.muted, display: 'block', marginBottom: '8px' }}>UNCLAIMED REWARDS</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                    <span>MTK: {parseFloat(balances.rMtk).toFixed(4)}</span>
                    <span>USDT: {parseFloat(balances.rUsdt).toFixed(4)}</span>
                  </div>
                  <button onClick={() => handleTransaction("Claim", contracts.pool.claimRewards)} disabled={loading} style={{ ...btnStyle(theme.accent), marginTop: '12px', padding: '8px' }}>Claim Now</button>
                </div>
              </div>
            </div>

            {/* RIGHT: ACTION PANELS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>🔄 Instant Swap</h3>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: theme.muted }}>SWAP MTK FOR USDT</label>
                  <input placeholder="0.00 MTK" style={inputStyle} value={inputs.swapMtk} onChange={e => setInputs({...inputs, swapMtk: e.target.value})} />
                  <button onClick={() => onSwap(true)} disabled={loading} style={btnStyle(theme.primary)}>Confirm Swap</button>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: theme.muted }}>SWAP USDT FOR MTK</label>
                  <input placeholder="0.00 USDT" style={inputStyle} value={inputs.swapUsdt} onChange={e => setInputs({...inputs, swapUsdt: e.target.value})} />
                  <button onClick={() => onSwap(false)} disabled={loading} style={btnStyle(theme.primary)}>Confirm Swap</button>
                </div>
              </div>

              <div style={cardStyle}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>💧 Liquidity Management</h3>
                <div style={{ marginBottom: '25px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: theme.muted }}>ADD TO POOL</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input placeholder="MTK" style={inputStyle} value={inputs.addMtk} onChange={e => setInputs({...inputs, addMtk: e.target.value})} />
                    <input placeholder="USDT" style={inputStyle} value={inputs.addUsdt} onChange={e => setInputs({...inputs, addUsdt: e.target.value})} />
                  </div>
                  <button onClick={onAddLiquidity} disabled={loading} style={btnStyle(theme.accent)}>Add Liquidity</button>
                </div>
                <div style={{ paddingTop: '20px', borderTop: '1px solid #F3F4F6' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: theme.muted }}>REMOVE FROM POOL</label>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <input placeholder="LP Shares to burn" style={{ ...inputStyle, marginBottom: 0 }} value={inputs.removeLp} onChange={e => setInputs({...inputs, removeLp: e.target.value})} />
                    <button onClick={() => onRemoveLiquidity(false)} disabled={loading} style={{ ...btnStyle('#6B7280'), width: '150px' }}>Remove</button>
                  </div>
                  <button onClick={() => onRemoveLiquidity(true)} disabled={loading} style={btnStyle(theme.danger)}>🔥 Remove All My Liquidity</button>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default App;