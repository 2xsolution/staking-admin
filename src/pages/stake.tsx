import { Fragment, useRef, useState, useEffect } from "react";
import useNotify from "./notify";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import * as anchor from "@project-serum/anchor";
import {
  AccountLayout,
  MintLayout,
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { programs } from "@metaplex/js";
import moment from "moment";
import {
  Connection,
  Keypair,
  Signer,
  PublicKey,
  Transaction,
  TransactionSignature,
  ConfirmOptions,
  sendAndConfirmRawTransaction,
  RpcResponseAndContext,
  SimulatedTransactionResponse,
  Commitment,
  LAMPORTS_PER_SOL,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_CLOCK_PUBKEY,
  clusterApiUrl,
} from "@solana/web3.js";
import axios from "axios";
import Loader from "../components/Loader";

let wallet: any;
let conn = new Connection(clusterApiUrl("mainnet-beta"));
let notify: any;
const {
  metadata: { Metadata },
} = programs;
const COLLECTION_NAME = "Zoku";
const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);
const programId = new PublicKey("EnvYMhDHtBZzadw8NK5UfctRvcMgNH1PGT7KkAcDAyKD");
const idl = require("./solana_anchor.json");
const confirmOption: ConfirmOptions = {
  commitment: "finalized",
  preflightCommitment: "finalized",
  skipPreflight: false,
};

const REWARD_TOKEN = "Azw7nHFCUrY3i2RpRLxJja1mooiZkAai3ipsmQTeMqNQ";
let POOL = new PublicKey("4F711h78UKj5TkaTPdWjW6WKYQnNN8dAUecccF8etRFH");
const STAKEDATA_SIZE = 8 + 1 + 32 + 32 + 32 + 8 + 1;
const createAssociatedTokenAccountInstruction = (
  associatedTokenAddress: anchor.web3.PublicKey,
  payer: anchor.web3.PublicKey,
  walletAddress: anchor.web3.PublicKey,
  splTokenMintAddress: anchor.web3.PublicKey
) => {
  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
    { pubkey: walletAddress, isSigner: false, isWritable: false },
    { pubkey: splTokenMintAddress, isSigner: false, isWritable: false },
    {
      pubkey: anchor.web3.SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    {
      pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];
  return new anchor.web3.TransactionInstruction({
    keys,
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.from([]),
  });
};

const getMasterEdition = async (
  mint: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> => {
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
        Buffer.from("edition"),
      ],
      TOKEN_METADATA_PROGRAM_ID
    )
  )[0];
};

const getMetadata = async (
  mint: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> => {
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    )
  )[0];
};

const getTokenWallet = async (
  wallet: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey
) => {
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [wallet.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  )[0];
};

async function sendTransaction(transaction: Transaction, signers: Keypair[]) {
  try {
    transaction.feePayer = wallet.publicKey;
    transaction.recentBlockhash = (
      await conn.getRecentBlockhash("max")
    ).blockhash;
    await transaction.setSigners(
      wallet.publicKey,
      ...signers.map((s) => s.publicKey)
    );
    if (signers.length != 0) await transaction.partialSign(...signers);
    const signedTransaction = await wallet.signTransaction(transaction);
    let hash = await conn.sendRawTransaction(
      await signedTransaction.serialize()
    );
    await conn.confirmTransaction(hash);
    notify("success", "Success!");
  } catch (err) {
    console.log(err);
    notify("error", "Failed Instruction!");
  }
}

async function initPool(
  rewardMint: PublicKey,
  rewardAmount: number,
  period: number,
  withdrawable: number,
  stakeCollection: string
) {
  console.log("+ initPool");
  let provider = new anchor.Provider(conn, wallet as any, confirmOption);
  let program = new anchor.Program(idl, programId, provider);
  let randomPubkey = Keypair.generate().publicKey;
  let [pool, bump] = await PublicKey.findProgramAddress(
    [randomPubkey.toBuffer()],
    programId
  );
  let rewardAccount = await getTokenWallet(pool, rewardMint);
  let transaction = new Transaction();
  let signers: Keypair[] = [];
  transaction.add(
    createAssociatedTokenAccountInstruction(
      rewardAccount,
      wallet.publicKey,
      pool,
      rewardMint
    )
  );
  transaction.add(
    await program.instruction.initPool(
      new anchor.BN(bump),
      new anchor.BN(rewardAmount),
      new anchor.BN(period),
      new anchor.BN(withdrawable),
      stakeCollection,
      {
        accounts: {
          owner: wallet.publicKey,
          pool: pool,
          rand: randomPubkey,
          rewardMint: rewardMint,
          rewardAccount: rewardAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
      }
    )
  );
  await sendTransaction(transaction, []);
  return pool;
}

async function stake(nftMint: PublicKey) {
  console.log("+ stake");
  let provider = new anchor.Provider(conn, wallet as any, confirmOption);
  let program = new anchor.Program(idl, programId, provider);
  const stakeData = Keypair.generate();
  const metadata = await getMetadata(nftMint);
  const sourceNftAccount = await getTokenWallet(wallet.publicKey, nftMint);
  const destNftAccount = await getTokenWallet(POOL, nftMint);
  console.log(sourceNftAccount.toBase58());
  console.log(destNftAccount.toBase58());
  let transaction = new Transaction();
  let signers: Keypair[] = [];
  signers.push(stakeData);
  if ((await conn.getAccountInfo(destNftAccount)) == null)
    transaction.add(
      createAssociatedTokenAccountInstruction(
        destNftAccount,
        wallet.publicKey,
        POOL,
        nftMint
      )
    );
  transaction.add(
    await program.instruction.stake({
      accounts: {
        owner: wallet.publicKey,
        pool: POOL,
        stakeData: stakeData.publicKey,
        nftMint: nftMint,
        metadata: metadata,
        sourceNftAccount: sourceNftAccount,
        destNftAccount: destNftAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        clock: SYSVAR_CLOCK_PUBKEY,
      },
    })
  );
  await sendTransaction(transaction, signers);
}

async function unstake(stakeData: PublicKey) {
  console.log("+ unstake");
  let provider = new anchor.Provider(conn, wallet as any, confirmOption);
  let program = new anchor.Program(idl, programId, provider);
  let stakedNft = await program.account.stakeData.fetch(stakeData);
  let account = await conn.getAccountInfo(stakedNft.account);
  let mint = new PublicKey(AccountLayout.decode(account!.data).mint);
  const destNftAccount = await getTokenWallet(wallet.publicKey, mint);
  let transaction = new Transaction();

  transaction.add(
    await program.instruction.unstake({
      accounts: {
        owner: wallet.publicKey,
        pool: POOL,
        stakeData: stakeData,
        sourceNftAccount: stakedNft.account,
        destNftAccount: destNftAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        clock: SYSVAR_CLOCK_PUBKEY,
      },
    })
  );
  await sendTransaction(transaction, []);
}

async function claim() {
  console.log("+ claim");
  let provider = new anchor.Provider(conn, wallet as any, confirmOption);
  let program = new anchor.Program(idl, programId, provider);
  let resp = await conn.getProgramAccounts(programId, {
    dataSlice: { length: 0, offset: 0 },
    filters: [
      { dataSize: STAKEDATA_SIZE },
      { memcmp: { offset: 9, bytes: wallet.publicKey!.toBase58() } },
      { memcmp: { offset: 41, bytes: POOL.toBase58() } },
    ],
  });
  await getPoolData(null);
  let destRewardAccount = await getTokenWallet(wallet.publicKey, pD.rewardMint);
  let transaction = new Transaction();
  if ((await conn.getAccountInfo(destRewardAccount)) == null)
    transaction.add(
      createAssociatedTokenAccountInstruction(
        destRewardAccount,
        wallet.publicKey,
        wallet.publicKey,
        pD.rewardMint
      )
    );
  for (let stakeAccount of resp) {
    let stakedNft = await program.account.stakeData.fetch(stakeAccount.pubkey);
    let num = (moment().unix() - stakedNft.stakeTime.toNumber()) / pD.period;
    if (num > pD.withdrawable) num = pD.withdrawable;
    transaction.add(
      await program.instruction.claim({
        accounts: {
          owner: wallet.publicKey,
          pool: POOL,
          stakeData: stakeAccount.pubkey,
          sourceRewardAccount: pD.rewardAccount,
          destRewardAccount: destRewardAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: SYSVAR_CLOCK_PUBKEY,
        },
      })
    );
  }
  await sendTransaction(transaction, []);
}

async function getNftsForOwner(conn: any, owner: PublicKey) {
  console.log("+ getNftsForOwner");
  const allTokens: any = [];
  const tokenAccounts = await conn.getParsedTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID,
  });

  for (let index = 0; index < tokenAccounts.value.length; index++) {
    try {
      const tokenAccount = tokenAccounts.value[index];
      const tokenAmount = tokenAccount.account.data.parsed.info.tokenAmount;

      if (tokenAmount.amount == "1" && tokenAmount.decimals == "0") {
        let nftMint = new PublicKey(tokenAccount.account.data.parsed.info.mint);
        let [pda] = await anchor.web3.PublicKey.findProgramAddress(
          [
            Buffer.from("metadata"),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            nftMint.toBuffer(),
          ],
          TOKEN_METADATA_PROGRAM_ID
        );
        const accountInfo: any = await conn.getParsedAccountInfo(pda);
        let metadata: any = new Metadata(owner.toString(), accountInfo.value);
        const { data }: any = await axios.get(metadata.data.data.uri);
        if (metadata.data.data.symbol == COLLECTION_NAME) {
          const entireData = {
            ...data,
            id: Number(data.name.replace(/^\D+/g, "").split(" - ")[0]),
          };
          allTokens.push({ address: nftMint, ...entireData });
          console.log(data);
        }
      }
      allTokens.sort(function (a: any, b: any) {
        if (a.name < b.name) {
          return -1;
        }
        if (a.name > b.name) {
          return 1;
        }
        return 0;
      });
    } catch (err) {
      continue;
    }
  }
  return allTokens;
}

async function getStakedNftsForOwner(conn: Connection, owner: PublicKey) {
  console.log("+ getStakedNftsForOwner");
  const wallet = new anchor.Wallet(Keypair.generate());
  const provider = new anchor.Provider(
    conn,
    wallet,
    anchor.Provider.defaultOptions()
  );
  const program = new anchor.Program(idl, programId, provider);
  const allTokens: any = [];
  let resp = await conn.getProgramAccounts(programId, {
    dataSlice: { length: 0, offset: 0 },
    filters: [
      { dataSize: STAKEDATA_SIZE },
      { memcmp: { offset: 9, bytes: owner.toBase58() } },
      { memcmp: { offset: 41, bytes: POOL.toBase58() } },
    ],
  });
  for (let nftAccount of resp) {
    let stakedNft = await program.account.stakeData.fetch(nftAccount.pubkey);
    if (stakedNft.unstaked) continue;
    let account = await conn.getAccountInfo(stakedNft.account);
    let mint = new PublicKey(AccountLayout.decode(account!.data).mint);
    let pda = await getMetadata(mint);
    const accountInfo: any = await conn.getParsedAccountInfo(pda);
    let metadata: any = new Metadata(owner.toString(), accountInfo.value);
    const { data }: any = await axios.get(metadata.data.data.uri);
    const entireData = {
      ...data,
      id: Number(data.name.replace(/^\D+/g, "").split(" - ")[0]),
    };
    allTokens.push({
      withdrawnNumber: stakedNft.withdrawnNumber,
      stakeTime: stakedNft.stakeTime.toNumber(),
      stakeData: nftAccount.pubkey,
      address: mint,
      ...entireData,
    });
  }
  return allTokens;
}

let pD: any;
async function getPoolData(callback: any) {
  let wallet = new anchor.Wallet(Keypair.generate());
  let provider = new anchor.Provider(conn, wallet, confirmOption);
  const program = new anchor.Program(idl, programId, provider);
  let poolData = await program.account.pool.fetch(POOL);
  let data = "";
  // data += "Reward Mint : " + poolData.rewardMint.toBase58() + "\n";
  // data += "Reward Account : " + poolData.rewardAccount.toBase58() + "\n";
  // // console.log(poolData.rewardAccount.toBase58())
  // data += "Reward Amount : " + poolData.rewardAmount.toNumber() + "\n";
  // data += "Period : " + poolData.period.toNumber() + "s\n";
  // data += "Withdrawable Number : " + poolData.withdrawable + "\n";
  // data += "Collection Name : " + poolData.stakeCollection + "\n";
  // alert(data)
  pD = {
    rewardMint: poolData.rewardMint,
    rewardAccount: poolData.rewardAccount,
    rewardAmount: poolData.rewardAmount.toNumber(),
    period: poolData.period.toNumber(),
    withdrawable: poolData.withdrawable,
    stakeCollection: poolData.stakeCollection,
  };
  if (callback != null) callback();
}

let claimAmount = 0;
async function getClaimAmount(conn: Connection, owner: PublicKey) {
  console.log("+ getClaimAmount");
  const wallet = new anchor.Wallet(Keypair.generate());
  const provider = new anchor.Provider(
    conn,
    wallet,
    anchor.Provider.defaultOptions()
  );
  const program = new anchor.Program(idl, programId, provider);
  let resp = await conn.getProgramAccounts(programId, {
    dataSlice: { length: 0, offset: 0 },
    filters: [
      { dataSize: STAKEDATA_SIZE },
      { memcmp: { offset: 9, bytes: owner.toBase58() } },
      { memcmp: { offset: 41, bytes: POOL.toBase58() } },
    ],
  });
  claimAmount = 0;
  await getPoolData(null);

  for (let stakeAccount of resp) {
    let stakedNft = await program.account.stakeData.fetch(stakeAccount.pubkey);
    let num = Math.floor(
      (moment().unix() - stakedNft.stakeTime.toNumber()) / pD.period
    );
    if (num > pD.withdrawable) num = pD.withdrawable;
    claimAmount += pD.rewardAmount * (num - stakedNft.withdrawnNumber);
  }

  console.log(claimAmount);
}

let nfts: any[] = [];
let stakedNfts: any[] = [];

async function getNfts(callback: any) {
  nfts.splice(0, nfts.length);
  stakedNfts.splice(0, stakedNfts.length);
  await getPoolData(null);
  nfts = await getNftsForOwner(conn, wallet.publicKey);
  stakedNfts = await getStakedNftsForOwner(conn, wallet.publicKey);
  console.log(nfts);
  console.log(stakedNfts);
  if (callback != null) callback();
}

let init = true;
export default function Stake() {
  wallet = useWallet();
  notify = useNotify();
  const [changed, setChange] = useState(true);
  const [rewardAmount, setRewardAmount] = useState(10);
  const [period, setPeriod] = useState(60);
  const [withdrawable, setWithdrawable] = useState(7);
  const [collectionName, setCollectionName] = useState(COLLECTION_NAME);
  const [rewardToken, setRewardToken] = useState(REWARD_TOKEN);
  const render = () => {
    setChange(!changed);
  };
  if (wallet.publicKey != undefined && init) {
    init = false;
    getNfts(render);
  }

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  const stopLoading = () => {
    setLoadingMessage("");
    setIsLoading(false);
  };

  return (
    <div className="container-fluid mt-4">
      {isLoading && <Loader text={loadingMessage} />}{" "}
      <div className="custom-form">
        <div className="input-div">
          <span>Reward amount</span>
          <input
            type="number"
            placeholder="Enter wallet address"
            className="custom-input"
            onChange={(event) => {
              setRewardAmount(Number(event.target.value));
            }}
            value={rewardAmount}
          />
        </div>
        <div className="input-div">
          <span>Period(s)</span>
          <input
            type="number"
            placeholder="Period(s)"
            onChange={(event) => {
              setPeriod(Number(event.target.value));
            }}
            value={period}
            className="custom-input"
          />
        </div>
        <div className="input-div">
          <span>Withdrawable num</span>
          <input
            type="number"
            placeholder="Withdrawable num"
            className="custom-input"
            onChange={(event) => {
              setWithdrawable(Number(event.target.value));
            }}
            value={withdrawable}
          />
        </div>
        <div className="input-div">
          <span>Collection Name</span>
          <input
            type="text"
            placeholder="Collection Name"
            className="custom-input"
            onChange={(event) => {
              setCollectionName(event.target.value);
            }}
            value={collectionName}
          />
        </div>
        <div className="input-div">
          <span>Reward Token</span>
          <input
            type="text"
            placeholder="Reward Token"
            className="custom-input"
            onChange={(event) => {
              setRewardToken(event.target.value);
            }}
            value={rewardToken}
          />
        </div>

        <div className="custom-btn-group">
          <button
            className="custom-btn dark-btn"
            onClick={async () => {
              setIsLoading(true);
              setLoadingMessage("Creating Staking Pool");

              POOL = await initPool(
                new PublicKey(rewardToken),
                rewardAmount,
                period,
                withdrawable,
                collectionName
              );
              render();
              stopLoading();
            }}
          >
            Create Staking Pool
          </button>
          <button
            className="custom-btn dark-btn"
            onClick={async () => {
              setIsLoading(true);
              setLoadingMessage("Fetching Pool Data");
              await getPoolData(render).then(() => stopLoading());
            }}
          >
            Get Pool Data
          </button>
          <button
            className="custom-btn dark-btn"
            onClick={async () => {
              setIsLoading(true);
              setLoadingMessage("Redirecting");
              await getNfts(render).then(() => stopLoading());
            }}
          >
            Redirect
          </button>
        </div>
      </div>
      {/* <div className="row mb-3">
        <div className="col-lg-3">
          <div className="input-group">
            <div className="input-group-prepend">
              <span className="input-group-text">Reward amount</span>
            </div>
            <input
              name="rewardAmount"
              type="number"
              className="form-control"
              onChange={(event) => {
                setRewardAmount(Number(event.target.value));
              }}
              value={rewardAmount}
            />
          </div>
        </div>
        <div className="col-lg-3">
          <div className="input-group">
            <div className="input-group-prepend">
              <span className="input-group-text">Period(s)</span>
            </div>
            <input
              name="period"
              type="number"
              className="form-control"
              onChange={(event) => {
                setPeriod(Number(event.target.value));
              }}
              value={period}
            />
          </div>
        </div>
        <div className="col-lg-3">
          <div className="input-group">
            <div className="input-group-prepend">
              <span className="input-group-text">Withdrawable num</span>
            </div>
            <input
              name="withdrawable"
              type="number"
              className="form-control"
              onChange={(event) => {
                setWithdrawable(Number(event.target.value));
              }}
              value={withdrawable}
            />
          </div>
        </div>
        <div className="col-lg-3">
          <div className="input-group">
            <div className="input-group-prepend">
              <span className="input-group-text">Collection Name</span>
            </div>
            <input
              name="collectionName"
              type="text"
              className="form-control"
              onChange={(event) => {
                setCollectionName(event.target.value);
              }}
              value={collectionName}
            />
          </div>
        </div>
      </div>
      <div className="row mb-3">
        <div className="col-lg-4">
          <div className="input-group">
            <div className="input-group-prepend">
              <span className="input-group-text">Reward Token</span>
            </div>
            <input name="rewardToken" type="text" className="form-control" />
          </div>
        </div>
        <div className="col-lg-4">
          <button
            type="button"
            className="btn btn-warning m-1"
            onClick={async () => {
              POOL = await initPool(
                new PublicKey(rewardToken),
                rewardAmount,
                period,
                withdrawable,
                collectionName
              );
              render();
            }}
          >
            Create Staking Pool
          </button>
          <button
            type="button"
            className="btn btn-warning m-1"
            onClick={async () => {
              await getPoolData(render);
            }}
          >
            Get Pool Data
          </button>
          <button
            type="button"
            className="btn btn-warning m-1"
            onClick={async () => {
              await getNfts(render);
            }}
          >
            Redirect
          </button>
        </div>
        <div className="col-lg-4">{POOL ? POOL.toBase58() : ""}</div>
      </div> */}
      <hr />
      <div className="row custom-pool-div">
        <div className="col-lg-6">
          <h5>SOL: {claimAmount}</h5>
          <div className="d-flex">
            <button
              type="button"
              className="w-max custom-btn m-1"
              onClick={async () => {
                setIsLoading(true);
                setLoadingMessage("Getting Claim Amount");
                await getClaimAmount(conn, wallet.publicKey).then(() =>
                  stopLoading()
                );
                render();
              }}
            >
              Get Claim Amount
            </button>
            <button
              type="button"
              className="w-max custom-btn m-1 "
              onClick={async () => {
                setIsLoading(true);
                setLoadingMessage("Please wait! Getting your Claim");
                await claim();
                await getClaimAmount(conn, wallet.publicKey).then(() =>
                  stopLoading()
                );
                render();
              }}
            >
              Claim
            </button>
          </div>
        </div>
        {pD && (
          <div className="col-lg-6 custom-pool-data">
            <h3>Pool Data</h3>
            <h5>
              {"Reward Mint : "} <span>{pD!.rewardMint.toBase58()}</span>{" "}
            </h5>
            <h5>
              {"Reward Account : "} <span>{pD!.rewardAccount.toBase58()}</span>
            </h5>
            <h5>
              {"Reward Amount :"} <span>{pD.rewardAmount!}</span>
            </h5>
            <h5>
              {"Period : "} <span>{pD.period}</span>{" "}
            </h5>
            <h5>
              {"Withdrawable Number: "}
              <span>{pD.withdrawable}</span>{" "}
            </h5>
            <h5>
              {"CollectionName : "} <span>{pD.stakeCollection}</span>
            </h5>
          </div>
        )}
      </div>
      <hr />
      <div className="row custom-nft-div">
        <div className="col-lg-6">
          <h4>Your Wallet NFT</h4>
          <div className="responsive-div">
            {/* // loop  */}
            {nfts.map((nft, idx) => {
              return (
                <div className="custom-nft-card">
                  <h4>{nft.name}</h4>
                  {/* <h4>Hello</h4> */}
                  <div className="custom-nft-img-div" key={idx}>
                    <img
                      src={nft.image}
                      // src="https://images.pexels.com/photos/7738663/pexels-photo-7738663.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
                      alt=""
                    />
                    <button
                      className="custom-btn w-max m-0"
                      onClick={async () => {
                        setIsLoading(true);
                        setLoadingMessage("Your NFT is staking");
                        await stake(nft.address).then(() => stopLoading());
                      }}
                    >
                      Stake
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* <div className="row">
            {nfts.map((nft, idx) => {
              return (
                <div className="card m-3" key={idx} style={{ width: "250px" }}>
                  <img
                    className="card-img-top"
                    src={nft.image}
                    alt="Image Error"
                  />
                  <div className="card-img-overlay">
                    <h4>{nft.name}</h4>
                    <button
                      type="button"
                      className="btn btn-success"
                      onClick={async () => {
                        await stake(nft.address);
                      }}
                    >
                      Stake
                    </button>
                  </div>
                </div>
              );
            })}
          </div> */}
        </div>
        <div className="col-lg-6">
          <h4>Your Staked NFT</h4>
          {stakedNfts.map((nft, idx) => {
            return (
              <div className="custom-nft-card">
                <h4>{nft.name}</h4>
                {/* <h4>Hello</h4> */}
                <div className="custom-nft-img-div" key={idx}>
                  <img
                    src={nft.image}
                    // src="https://images.pexels.com/photos/7738663/pexels-photo-7738663.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
                    alt=""
                  />
                  {moment().unix() >
                  nft.stakeTime + pD.period * pD.withdrawable ? (
                    <button
                      className="custom-btn w-max m-0"
                      onClick={async () => {
                        setIsLoading(true);
                        setLoadingMessage("Redeem in progress");
                        await unstake(nft.stakeData).then(() => stopLoading());
                      }}
                    >
                      Redeem
                    </button>
                  ) : (
                    <h4>nft.stakeTime</h4>
                  )}
                  <button
                    className="custom-btn w-max m-0"
                    onClick={async () => {
                      // await unstake(nft.stakeData);
                    }}
                  >
                    Stake
                  </button>
                </div>
              </div>
            );
          })}

          {/* <div className="row">
            {stakedNfts.map((nft, idx) => {
              return (
                <div className="card m-3" key={idx} style={{ width: "250px" }}>
                  <img
                    className="card-img-top"
                    src={nft.image}
                    alt="Image Error"
                  />
                  <div className="card-img-overlay">
                    <h4>{nft.name}</h4>
                    {moment().unix() >
                    nft.stakeTime + pD.period * pD.withdrawable ? (
                      <button
                        type="button"
                        className="btn btn-success"
                        onClick={async () => {
                          await unstake(nft.stakeData);
                        }}
                      >
                        Redeem
                      </button>
                    ) : (
                      <h4>nft.stakeTime</h4>
                    )}
                  </div>
                </div>
              );
            })}
          </div> */}
        </div>
      </div>
    </div>
  );
}
