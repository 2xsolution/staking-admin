import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { SnackbarProvider } from "notistack";
import {
  getLedgerWallet,
  getPhantomWallet,
  getSlopeWallet,
  getSolflareWallet,
  getSolletExtensionWallet,
  getSolletWallet,
  getTorusWallet,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import { WalletConnect } from "./wallet";
// import Mint from './pages/mint'
import Stake from "./pages/stake";
import "./bootstrap.min.css";
import "./App.css";
import Logo from "./assets/logo.png";
import "@solana/wallet-adapter-react-ui/styles.css";
export default function App() {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  const wallets = useMemo(() => [getPhantomWallet()], []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SnackbarProvider>
            <div
              className="d-flex justify-content-between align-items-center px-4 py-2 my-navbar"
              style={{ background: "#E0CCFB" }}
            >
              <img className="logo" src={Logo} alt="" />
              <WalletConnect />
            </div>
            <Stake />
          </SnackbarProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
