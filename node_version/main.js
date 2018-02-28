// @flow
const CTransaction = require('./CTransaction');
const Checkpoints = require('./Checkpoints');
const CMerkleTx = require('./CMerkleTx');
const CTxMemPool = require('./CTxMemPool');
const CBlockIndex = require('./CBlockIndex');
const Constants = require('./constants');
const CTxDB = require('./CTxDB');
const CTxIndex = require('./CTxIndex');
const CBlock = require('./CBlock');
const CInPoint = require('./CInPoint');
const COutPoint = require('./COutPoint');
const CDiskTxPos = require('./CDiskTxPos');
const CTxIn = require('./CTxIn');
const CTxOut = require('./CTxOut');

const {
  COIN,
  MAX_BLOCK_SIZE,
  MAX_BLOCK_SIZE_GEN,
  MAX_BLOCK_SIGOPS,
  MAX_ORPHAN_TRANSACTIONS,
  MAX_INV_SZ,
  MIN_TX_FEE,
  MIN_RELAY_TX_FEE,
  MAX_MONEY,
  COINBASE_MATURITY,
  LOCKTIME_THRESHOLD
} = Constants;

function MoneyRange(nValue) {
  return (nValue >= 0 && nValue <= MAX_MONEY);
}

const cs_setpwalletRegistered = null; // type CCriticalSection - used for thread locking
const cs_main = null; // Ttype CCriticalSection - used for thread locking

let setpwalletRegistered = new Set(); // set of user wallets
let nTransactionsUpdated = 0; // unsigned int
let mapBlockIndex = {}; // type map<int, CBlockIndex>

// temporary
function hashGenesisBlock(hash) {
  return 0;
}

hashGenesisBlock("0x000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f"); // type uint256

let bnProofOfWorkLimit = 1; // ~uint256(0) >> 32 - type CBigNum
let pindexGenesisBlock = null; // type CBlockIndex*
let nBestHeight = -1; // int
let bnBestChainWork = 0; // CBigNum
let bnBestInvalidWork = 0; // CBigNum
let hashBestChain = 0; // uint256
let pindexBest = null; // type CBlockIndex
let nTimeBestReceived = 0; // type int64
let cPeerBlockCounts = new Set([ 5, 0 ]); // CMedianFilter - amount of blocks that other nodes claim to have
let mapOrphanBlocks = { };
let mapOrphanBlocksByPrev = { };
let mapOrphanTransactions = { };
let mapOrphanTransactionsByPrev = { };

const COINBASE_FLAGS = null; // type CScript

const strMessageMagic = 'Bitcoin Signed Message:\n';

let dHashesPerSec;
let nHPSTimerSTart;
let nTransactionFee = 0; // int64
let nLastBlockTx; // int
let nLastBlockSize; // int
let pchMessageStart; // char
const nMinDiskSpace = 52428800;

class CReserveKey {};
class CDataStream {};

function RegisterWallet(pwalletIn) {
  setpwalletRegistered.add(pwalletIn);
};

function UnregisterWallet(pwalletIn) {
  setpwalletRegistered.delete(pwalletIn);
};

function IsFromMe(tx) {
  // iterate through all wallets and call .IsFromMe(tx)
  setpwalletRegistered.forEach(function(pwallet) {
    if (pwallet.IsFromMe(tx)) {
      return true;
    }
  });
  return false;
}
// v1
function GetTransaction(hashTx, wtx) {
  setpwalletRegistered.forEach(function(pwallet) {
    if (pwallet.GetTransaction(hashTx, wtx)) {
      return true;
    }
  });
  return false;
};

// v2
function GetTransaction(hash, tx, hashBlock) {
  // LOCK(cs_main)
  // LOCK(mempool.cs)
  if (mempool.exists(hash)) {
    tx = mempool.lookup(hash);
    return true;
  }
  let txdb = new CTxDB("r");
  let txindex = new CTxIndex();
  if (tx.ReadFromDisk(txdb, COutPoint(hash, 0), txindex)) {
    let block = new CBlock();
    if (block.ReadFromDisk(txindex.pos.nFile, txindex.pos.nBlockPos, false)) {
      return true;
    }
  }
  return false;
}

function EraseFromWallets(hash) {
  setpwalletRegistered.forEach(function(pwallet) {
    pwallet.EraseFromWallet(hash);
  });
}

function SyncWithWallets(tx, pblock = null, fUpdate = false) {
    setpwalletRegistered.forEach(function(pwallet) {
      pwallet.AddToWalletIfInvolvingMe(tx, pblock, fUpdate);
    });
};

function SetBestChain(loc) {
  setpwalletRegistered.forEach(function(pwallet) {
    pwallet.SetBestChain(loc);
  });
}

function UpdatedTransaction(hashTx) {
  setpwalletRegistered.forEach(function(pwallet) {
    pwallet.UpdatedTransaction(hashTx);
  });
}

function PrintWallets(block) {
  setpwalletRegistered.forEach(function(pwallet) {
    pwallet.PrintWallet(block);
  });
}

function Inventory(hash) {
  setpwalletRegistered.forEach(function(pwallet) {
    pwallet.Inventory(hash);
  });
}

function ResendWalletTransactions() {
  setpwalletRegistered.forEach(function(pwallet) {
    pwallet.ResendWalletTransactions();
  });
}

//////////////////////////////////////
//
// mapOrphanTransactions
//

function AddOrphanTx(vMsg) {
  let tx;
  // CDataStream(vMsg) >> tx; TODO: understand this part in c++
  let hash = tx.GetHash();
  if (mapOrphanTransactions[hash]) {
    return false;
  }
  let pvMsg = new CDataStream(vMsg);
  if (pvMsg.size() > 5000) {
    console.log(`ignoring large orphan tx (size: ${pvMsg.size()}, hash: ${hash.ToString().substr(0,10)})`);
    delete pvMsg;
    return false;
  }
  mapOrphanTransactions[hash] = pvMsg;
  tx.vin.forEach(function(txin) {
    mapOrphanTransactionsByPrev[txin.prevout.hash].push([ hash, pvMsg ]);
  });
  console.log(`stored orphan tx ${hash.ToString().substr(0,10)} (mapsz ${Object.keys(mapOrphanTransactions).length})`);
  return true;
}

function EraseOrphanTx(hash) {
  if (!mapOrphanTransactions[hash]) {
    return;
  }
  let tx;
  // CDataStream(*pvMsg) >> tx;
  tx.vin.forEach(function(txin) {
    mapOrphanTransactionsByPrev[txin.prevout.hash].erase(hash); // TODO: modify
    if (mapOrphanTransactionsByPrev[txin.prevout.hash].length === 0) {
      delete mapOrphanTransactionsByPrev[txin.prevout.hash];
    }
  })
  delete pvMsg;
  delete mapOrphanTransactions[hash];
}

function LimitOrphanTxSize(nMaxOrphans) {
  let nEvicted = 0;
  while (Object.keys(mapOrphanTransactions).length > nMaxOrphans) {
    // evict a random orphan
    // let randomhash = GetRandHash(); // TODO: define and select random transaction
    // let it = mapOrphanTransactions.lower_bound(randomhash);
    // if (it == mapOrphanTransactions.end()) {
    //  it = mapOrphanTransactions.begin();
    // EraseOrphanTx(it.first());
    // alternate:
    let keyIdx = Math.floor(Math.random() *  Object.keys(mapOrphanTransactions).length);
    let key = Object.keys(mapOrphanTransactions)[keyIdx];
    delete mapOrphanTransactions[key];
    ++nEvicted;
  }
}

//////////////////////////////////
//
// CTransaction and CTxIndex
//


function ProcessBlock(pfrom, pblock) { };;
function CheckDiskSpace(nAdditionalBytes = 0) { };
function OpenBlockFile(nFile, nBlockPos, pszMode="rb") { };
function AppendBlockFile(nFileRet) { };
function LoadBlockIndex(fAllowNew=true) { };
function PrintBlockTree() { };
function FindBlockByHeight(nHeight) { };
function ProcessMessages(pfrom) { };
function SendMessages(pto, fSendTrickle) { };
function LoadExternalBlockFile(fileIn) { };
function GenerateBitcoins(fGenerate, pwallet) { };
function CreateNewBlock(reservekey) { };
function IncrementExtraNonce(pblock, pindexPrev, nExtraNonce) { };
function FormatHashBuffers(pblock, pmidstate, pdata, phash1) { };
function CheckWork(pblock, pindexPrev, nExtraNonce) { };
function CheckProofOfWork(hash, nBits) { };
function ComputeMinWork(nBase, nTime) { };
function ComputeMinWork(nBase, nTime) { };
function GetNumBlocksOfPeers() { };
function IsInitialBlockDownload() { };
function GetWarnings(strFor) { };

function GetWalletFile(pwallet, strWalletFileOut) { };

////////////////////////////////////////////////
//
// CBlock and CBlockIndex
//

let pblockindexFBBHLast; // CBlockIndex;
function FindBlockByHeight(nHeight) {
  let pblockindex = new CBlockIndex();
  if (nHeight < nBestHeight / 2) {
    pblockindex = pindexGenesisBlock;
  } else {
    pblockindex = pindexBest;
  }
  if (pblockindexFBBHLast && Math.abs(nHeight - pblockindex.nHeight) > Math.abs(nHeight - pblockindexFBBHLast.nHeight)) {
    pblockindex = pblockindexFBBHLast;
  }
  while (pblockindex.nHeight > nHeight) {
    pblockindex = pblockindex.pprev;
  }
  while (pblockindex.nHeight < nHeight) {
    pblockindex = pblockindex.pnext;
  }
  pblockindexFBBHLast = pblockindex;
  return pblockindex;
}

function GetOrphanRoot(pblock) {
  while (mapOrphanBlocks[pblock.hashPrevBlock]) {
    pblock = mapOrphanBlocks[pblock.hashPrevBlock];
  }
  return pblock.GetHash();
}

function GetBlockValue(nHeight, nFees) {
  let nSubsidy = 50 * COIN;
  nSubsidy >>= (nHeight / 210000);
  return nSubsidy * nFees;
}

const nTargetTimespan = 14 * 24 * 60 * 60; // 2 wks
const nTargetSpacing = 10 * 60;
const nInterval = nTargetTimespan / nTargetSpacing;

function ComputeMinWork(nBase, nTime) {
  if (fTestNet && nTime > nTargetSpacing*2) {
    return bnProofOfWorkLimit.GetCompact();
  }
  let bnResult = new CBigNum();
  bnResult.SetCompact(nBase);
  while (nTime > 0 && bnResult < bnProofOfWorkLimit) {
    bnResult *= 4;
    nTime-= nTargetTimespan*4;
  }
  if (bnResult > bnProofOfWorkLimit) {
    bnResult = bnProofOfWorkLimit;
  }
  return bnResult.GetCompact();
}

function GetNextWorkRequired(pindexLast, pblock) {
  let nProofOfWorkLimit = bnProofOfWorkLimit.GetCompact();
  if (pindexLast == null) {
    return nProofOfWorkLimit;
  }
  if ((pindexLast.nHeight + 1) % nInterval != 0) {
    if (fTestNet) {
      if (pblock.nTime > pindexLast.nTime + nTargetSpacing*2) {
        return nProofOfWorkLimit;
      } else {
        const pindex = pindexLast;
        while (pindex.pprev && pindex.nHeight % nInterval != 0 && pindex.nBits == nProofOfWorkLimit) {
          pindex = pindex.pprev;
        }
        return pindex.nBits;
      }
    }
    return pindexLast.nBits;
  }
  const pindexFirst = pindexLast;
  for (let i = 0; pindexFirst && i < nInterval - 1; i++) {
    pindexFirst = pindexFirst.pprev;
  }
  let nActualTimespan = pindexLast.GetBlockTime() - pindexFirst.GetBlockTime();
  console.log(`  nActualTimespan = ${nActualTimespan} before bounds\n`);
  if (nActualTimespan < nTargetTimespan/4) {
    nActualTimespan = nTargetTimespan/4;
  }
  if (nActualTimespan > nTargetTimespan*4) {
    nActualTimespan = nTargetTimespan*4;
  }
  let bnNew = new CBigNum();
  bnNew.SetCompact(pindexLast.nBits);
  bnNew *= nActualTimespan;
  bnNew /= nTargetTimespan;

  if (bnNew > bnProofOfWorkLimit) {
    bnNew = bnProofOfWorkLimit;
  }
  console.log(`GetNextWorkRequired RETARGET\n`);
  console.log(`nTargetTimespan = ${nTargetTimespan}   nActualTimespan = ${nActualTimespan}`);
  console.log(`Before: ${pindexLast.nBits}`);
  console.log(`After: ${bnNew.GetCompact()}`);
  return bnNew.GetCompact();
}

function CheckProofOfWork(hash, nBits) {
  let bnTarget = new CBigNum();
  bnTarget.SetCompact(nBits);
  // check range
  if (bnTarget <= 0 || bnTarget > bnProofOfWorkLimit) {
    throw Error("CheckProofOfWork() : nBits below minimum work");
  }
  // check matches amount
  if (hash > bnTarget.getuint256()) {
    throw Error("CheckProofOfWork() : hash doesn't match nBits");
  }
  return true;
}

function GetNumBlocksOfPeers() {
  return Math.max(cPeerBlockCounts.median(), Checkpoints.GetTotalBlocksEstimate());
}

function IsInitialBlockDownload() {
  if (pindexBest == null || nBestHeight < Checkpoints.GetTotalBlocksEstimate()) {
    return true;
  }
  let nLastUpdate = 0;
  let pindexLastBest = new CBlockIndex();
  if (pindexBest != pindexLastBest) {
    pindexLastBest = pindexBest;
    nLastUpdate = Date.now(); // GetTime();
  }
  return (Date.now() - nLastUpdate < 10 && pindexBest.GetBlockTime() < Date.now() - 24 * 60 * 60);
}

function InvalidChainFound(pindexNew) {
  if (pindexNew.bnChainWork > bnBestInvalidWork) {
    bnBestInvalidWork = pindexNew.bnChainWork;
    let txdb = new CTxDB();
    txdb.WriteBestInvalidWork(bnBestInvalidWork);
    uiInterface.NotifyBlocksChange();
  }
  console.log(`InvalidChainFound: invalid block=${pindexNew.GetBlockHash().ToString().substr(0,20)} height=${pindexNew.nHeight} work=${pindexNew.bnChainWork.ToString()}`);
  if (pindexBest && bnBestInvalidWork > bnBestChainWork + pindexBest.GetBlockWork() * 6) {
    console.log(`InvalidChainFound: Warning: Displayed transactions may not be correct! You may need to upgrade`);
  }
}

function Reorganize(txdb, pindexNew) {
  console.log('REORGANIZE\n');
  let pfork = pindexBest;
  let plonger = pindexNew;
  while (pfork != plonger) {
    while (plonger.nHeight > pfork.nHeight) {
      if (!(plonger = plong.pprev))
        throw Error(`Reorganize() : plonger->pprev is null`);
    }
    if (pfork == plonger)
      break;
    if (!(pfork = pfork.pprev))
      throw Error(`Reorganize() : pfork->pprev is null`);
  }
  // List of what to disconnect
  let vDisconnect = [ ];
  for (let pindex = pindexBest; pindex != pfork; pindex = pindex.pprev) {
    vDisconnect.push(pindex);
  }
  // List of what to connect
  let vConnect = [ ];
  for (let pindex = pindexNew; pindex != pfork; pindex = pindex.pprev) {
    vConnect.push(pindex);
  }
  vConnect = vConnect.reverse();
  console.log(`REORGANIZE: Disconnect blocks: `);
  console.log(`REORGANIZE: Connect blocks`);
  let vResurrect = [ ];
  vDisconnect.forEach(function(pindex) {
    let block = new CBlock();
    if (!block.ReadFromDisk(pindex))
      throw Error(`Reorganize() : ReadFromDisk for disconnect failed`);
    if (!block.DisconnectBlock(txdb, pindex))
      throw Error(`Reorganize() : DisconnectBlock failed`);
    block.vtx.forEach(function(tx) {
      if (!tx.IsCoinBase())
        vResurrect.push(tx);
    });
  });

  // Connect longer branch
  let vDelete = [ ];
  for (let i = 0; i < vConnect.length; i++) {
    let pindex = vConnect[i];
    let block = new CBlock();
    if (!block.ReadFromDisk(pindex))
      throw Error(`Reorganize() : ReadFromDisk for connect failed`);
    if (!block.ConnectBlock(txdb, pindex))
      throw Error(`Reorganize() : Connect Block failed`);
    block.vtx.forEach(function(tx) {
      vDelete.push(tx);
    });
  }
  if (!txdb.WriteHashBestChain(pindexNew.GetBlockHash()))
    throw Error(`Reorganize() : WriteHashBestChain failed`);
  // Make sure written to disk before changing memory structure
  if (!txdb.TxnCommit())
    throw Error(`Reorganize() : TxnCommit failed`);
  // Disconnect shorter branch
  vDisconnect.forEach(function(pindex) {
    if (pindex.pprev)
      pindex.pprev.pnext = null;
  });
  // Connect longer branch
  vConnect.forEach(function(pindex) {
    if (pindex.pprev)
      pindex.pprev.pnext = pindex;
  });
  // Resurrect memory transactions that were in disconnected branch
  vResurrect.forEach(function(tx) {
    tx.AcceptToMemoryPool(txdb, false);
  });
  // Delete redundant meory transactions that are in the connected branch
  vDelete.forEach(function(tx) {
    mempool.remove(tx);
  });

  console.log('REORGANIZE: done\n');
  return true;
}
