// @flow
const CTransaction = require('.classes/CTransaction');
const Checkpoints = require('.classes/Checkpoints');
const CMerkleTx = require('.classes/CMerkleTx');
const CTxMemPool = require('.classes/CTxMemPool');
const CBlockIndex = require('.classes/CBlockIndex');
const Constants = require('./constants');
const CTxDB = require('.classes/CTxDB');
const CTxIndex = require('.classes/CTxIndex');
const CBlock = require('.classes/CBlock');
const CInPoint = require('.classes/CInPoint');
const COutPoint = require('.classes/COutPoint');
const CDiskTxPos = require('.classes/CDiskTxPos');
const CTxIn = require('.classes/CTxIn');
const CTxOut = require('.classes/CTxOut');

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

function ProcessBlock(pfrom, pblock) {
  let hash = pblock.GetHash();
  if (mapBlockIndex[hash])
    throw Error(`ProcessBlock() : already have block`);
  if (mapOrphanBlocks[hash])
    throw Error(`ProcessBlock() : already have orphan`);

  // Preliminary checks
  if (!pblock.CheckBlock())
    throw Error(`ProcessBlock() : CheckBlock failed`);

  let pcheckpoint = Checkpoints.GetLastCheckpoint(mapBlockIndex);
  if (pcheckpoint && pblock.hashPrevBlock != hashBestChain) {
    let deltaTime = pblock.GetBlockTime() - pcheckpoint.nTime;
    if (deltaTime < 0) {
      if (pfrom)
        pfrom.Misbehaving(100);
      throw Error(`ProcessBlock() : block with timestamp before last checkpoint`);
    }
    let bnNewBlock = new CBigNum();
    bnNewBlock.SetCompact(pblock.nBits);
    let bnRequired = new CBigNum();
    bnRequired.SetCompact(ComputeMinWork(pcheckpoint.nBits, deltaTime));
    if (bnNewBlock > bnRequired) {
      if (pfrom)
        pfrom.Misbehaving(100);
      throw Error(`ProcessBlock() : block with too-little proof of work`);
    }
  }

  // if we already don't have its previous block, shunt it off to holding area until we get it
  if (!mapBlockIndex[pblock.hashPrevBlock]) {
    console.log(`ProcessBlock: ORPHAN BLOCK`);
    // Accept orphans as long as there is a node to request its parents from
    if (pfrom) {
      let pblock2 = new CBlock(pblock);
      mapOrphanBlocks[hash] = pblock2;
      mapOrphanBlocksByPrev[pblock2.hashPrevBlock] = pblock2;
      // ask this guy to fill in what we're missing
      pfrom.PushGetBlocks(pindexBest, GetOrphanRoot(pblock2));
    }
    return true;
  }
  // Store to disk
  if (!pblock.AcceptBlock())
    throw Error(`ProcessBlock() : AcceptBlock failed`);
  // Recursively process orphan blocks
  let vWorkQueue = [ ];
  vWorkQueue.push(hash);
  for (let i = 0; i < vWorkQueue.length; i++) {
    let hashPrev = vWorkQueue[i];
    let pblockOrphan = mapOrphanBlocksByPrev[hashPrev];
    if (pblockOrphan.AcceptBlock())
      vWorkQueue.push(pblockOrphan.GetHash());
    delete mapOrphanBlocks[pblockOrphan.GetHash()]
    delete pblockOrphan;
    delete mapOrphanBlocksByPrev[hashPrev];
  }
  console.log(`ProcessBlock: ACCEPTED\n`);
  return true;
}

function CheckDiskSpace(nAdditionalBytes) {
  let nFreeBytesAvailable = 10000; // filesystem::space(GetDataDir()).available
  // Check for nMinDiskSpace bytes (currently 50MB)
  if (nFreeBytesAvailable < nMinDiskSpace + nAdditionalBytes) {
    fShutdown = true;
    let strMessage = `Warning: Disk space is low!`;
    strMiscWarning = strMessage;
    console.log(`*** ${strMessage}\n`);
    uiInterface.ThreadSafeMessageBox(strMessage, "Bitcoin", CClientUIInterface::OK | CClientUIInterface::ICON_EXCLAMATION | CClientUIInterface::MODAL);
    StartShutdown();
    return false;
  }
  return true;
}

function BlockFilePath(nFile) {
  let strBlockFn = `blk${nFile}04u.dat`
  return GetDataDir() / strBlockFn;
}

function OpenBlockFile(nFile, nBlockPos, pszMode) {
  if ((nFile < 1) || (nFile == -1))
    return null;
  let file = fs.ReadFileSync(BlockFilePath(nFile));
  if (!file)
    return null;
  return file;
}

let nCurrentBlockFile = 1;

function AppendBlockFile(nFileRet) {
  nFileRet = 0;
  let file = OpenBlockFile(nCurrentBlockFile, 0, 'ab');
  if (!file)
    return null;
  return file;
}

function LoadBlockIndex(fAllowNew) {
  if (fTestNet) {
    pchMessageStart[0] = 0x0b;
    pchMessageStart[1] = 0x11;
    pchMessageStart[2] = 0x09;
    pchMessageStart[3] = 0x07;
    hashGenesisBlock = uint256("000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943");
  }
  // Load block index
  let txdb = new CTxDB("cr");
  if (!txdb.LoadBlockIndex())
    return false;
  txdb.Close();
  // Init with genesis block
  if (Object.keys(mapBlockIndex).length === 0) {
    if (!fAllowNew)
      return false;
    // Genesis block
    let pszTimestamp = "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks";
    let txNew = new CTransaction();
    txNew.vin = [ new CInpoint() ];
    txNew.vout = [ new COutPoint() ]
    txNew.vin[0].scriptSig = new CScript(pszTimestamp); // CScript() << 486604799 << CBigNum(4) << vector<unsigned char>((const unsigned char*)pszTimestamp, (const unsigned char*)pszTimestamp + strlen(pszTimestamp))
    txNew.vout[0].nValue = 50 * COIN;
    txNew.vout[0].scriptPubKey = new CScript("04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f") // CScript() << ParseHex("04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f") << OP_CHECKSIG;
    let block = new CBlock();
    block.vtx.push(txNew);
    block.hashPrevBlock = 0;
    block.hashMerkleRoot = block.BuildMerkleTree();
    block.nVersion = 1;
    block.nTime = 1231006505;
    block.nBits = 0x1d00ffff;
    block.nNonce = 2083236893;

    if (fTestNet) {
      block.nTime = 1296688602;
      block.nNonce = 414098458;
    }

    // debug print
    console.log(block.GetHash().ToString());
    console.log(hashGenesisBlock.ToString());
    console.log(block.hashMerkleRoot.ToString());
    block.print();

    // Start new block file
    let nFile = 0;
    let nBlockPos = 0;
    if (!block.WriteToDisk(nFile, nBlockPos))
      throw Error(`LoadBlockIndex() : writing genesis block to disk failed`);
    if (!block.AddToBlockIndex(nFile, nBlockPos))
      throw Error(`LoadBlockIndex() : genesis block not accepted`);
  }
  return true;
}

function PrintBlockTree() {
  // pre-compute tree structure
  let mapNext = { }; // <CBlockIndex, vector<CBlockIndex> >
  for (let i = 0; i < Object.keys(mapBlockIndex).length; i++) {
    let key = Object.keys(mapBlockIndex)[i];
    let pindex = mapBlockIndex[key];
    if (mapNext[pindex.pprev]) {
      mapNext[pindex.pprev].push(pindex);
    } else {
      mapNext[pindex.pprev] = [ pindex ];
    }
  }
  let vStack = [ ]; // vector<pair<int, CBlockIndex*> >
  vStack.push([0, pindexGenesisBlock]);
  let nPrevCol = 0;
  while (vStack.length) {
    let [ nCol, pindex ] = vStack.pop();
    // print split or gap
    if (nCol > nPrevCol) {
      for (let i = 0; i < nCol - 1; i++)
        console.log('| ');
      console.log('|\\\n');
    } else if (nCol < nPrevCol) {
      for (let i = 0; i < nCol; i++)
        console.log('| ');
      console.log('|\n');
    }
    nPrevCol = nCol;

    // print columns
    for (let i = 0; i < nCol; i++)
      console.log('| ');

    // print item
    let block = new CBlock();
    block.ReadFromDisk(pindex);
    console.log(pindex.nHeight, pindex.nFile, pindex.nBlockPos, block.GetHash().ToString(), block.vtx.length);

    PrintWallets(block);

    // put the main time-chain first
    let vNext = mapNext[pindex]; // vector<CBlockIndex*>&
    for (let i = 0; i < vNext.length; i++) {
      if (vNext[i].pnext) {
        swap(vNext[0], vNext[i]);
        break;
      }
    }

    // iterate children
    for (let i = 0; i < vNext.length; i++) {
      vStack.push([ nCol+i, vNext[i] ]);
    }
  }
}

function LoadExternalBlockFile(fileIn) {
  let nStart = GetTimeMillis();
  let nLoaded = 0;
  // LOCK(cs_main);
  let blkdat = blkdat(fileIn, SER_DISK, CLIENT_VERSION);
  let nPos = 0;
  while (nPos != -1 && blkdat.good() && !fRequestShutdown) {
    // TODO: understand filesystem behavior below
    // unsigned char pchData[65536];
    // do {
    //     fseek(blkdat, nPos, SEEK_SET);
    //     int nRead = fread(pchData, 1, sizeof(pchData), blkdat);
    //     if (nRead <= 8)
    //     {
    //         nPos = (unsigned int)-1;
    //         break;
    //     }
    //     void* nFind = memchr(pchData, pchMessageStart[0], nRead+1-sizeof(pchMessageStart));
    //     if (nFind)
    //     {
    //         if (memcmp(nFind, pchMessageStart, sizeof(pchMessageStart))==0)
    //         {
    //             nPos += ((unsigned char*)nFind - pchData) + sizeof(pchMessageStart);
    //             break;
    //         }
    //         nPos += ((unsigned char*)nFind - pchData) + 1;
    //     }
    //     else
    //         nPos += sizeof(pchData) - sizeof(pchMessageStart) + 1;

  }
  return nLoaded > 0;
}

///////////////////////////////////////////
//
// CAlert
//

let mapAlerts = { }; // map<uint256, CAlert>
let cs_mapAlerts; // CCriticalSection

function GetWarnings(strFor) {
  let nPriority = 0;
  let strStatusBar = '';
  let strRPC = '';
  if (GetBoolArg("-testsafemode"))
    strRPC = 'test';

  // Misc warnings like out of disk space and clock is wrong
  if (strMiscWarning != '') {
    nPriority = 1000;
    strStatusBar = strMiscWarning;
  }

  // Longer invalid proof of work chain
  if (pindexBest && bnBestInvalidWork > bnBestChainWork + pindexBest.GetBlockWork() * 6) {
    nPriority = 2000;
    strStatusBar = strRPC = 'Warning: Displayed transactions may not be correct!';
  }

  // Alerts
  // LOCK(cs_mapAlerts);
  Object.keys(mapAlerts).forEach(function(key) {
    let alert = mapAlerts[key];
    if (alert.AppliesToMe() && alert.nPriority > nPriority) {
      nPriority = alert.nPriority;
      strStatusBar = alert.strStatusBar;
    }
  });

  if (strFor == 'statusbar')
    return strStatusBar;
  else if (strFor == 'rpc')
    return strRPC;
  return 'error';
}


////////////////////////////////
//
// Messages
//

function AlreadyHave(txdb, inv) {
  switch(inv.type) {
    case MSG_TX:
      let txInMap = false;
      // LOCK(mempool.cs);
      txInMap = (mempool.exists(inv.hash))
      return txInMap || mapOrphanTransactions[inv.hash] || txdb.ContainsTx(inv.hash);
    case MSG_BLOCK:
      return !!mapBlockIndex[inv.hash] || !!mapOrphanBlocks[inv.hash];
  }
  // don't know what it is, just say we already got one
  return true;
}

let pchMessageStart = [ 0xf9, 0xbe, 0xb4, 0xd9 ].join('');

function ProcessMessage(pfrom, strCommand, vRecv) {
  let mapReuseKey = { }; // map<CService, CPubKey>
  RandAddSeedPerfmon();
  if (fDebug)
    console.log(`received: (bytes)`);
  if (mapArgs["-dropmessagestest"] && GetRand(atoi(mapArgs["-dropmessagestest"])) == 0) {
    console.log(`dropmessagestest DROPPINV RECV MESSAGE\n`);
    return true;
  }

  if (strCommand == 'version') {
    if (pfrom.nVersion != 0) {
      pfrom.Misbehaving(1);
      return false;
    }
    let nTime = 0;
    let addrMe = new CAddress();
    let addrFrom = new CAddress();
    let nNonce = 1;
    vRecv = [ ...vRecv, pfrom.nVersion, pfrom.nServices, nTime, addrMe ];
    // vRecv >> pfrom.nVersion >> pfrom.nSevices >> nTime >> addrMe;
    if (pfrom.nVersion < MIN_PROTO_VERSION) {
      console.log(`partner using obsolete version: disconnecting`);
      pfrom.fDisconnect = true;
      return false;
    }
    if (pfrom.nVersion == 10300)
      pfrom.nVersion = 300;
    if (!vRecv.length)
      vRecv =  [ ...vRecv, addrFrom, nNonce ];
    if (!vRecv.length)
      vRecv = [ ...vRecv, pfrom.strSubVer ];
    if (!vRecv.length)
      vRecv = [ ...vRecv, pfrom.nStartingHeight ];

    if (pfrom.fInbound && addrMe.IsRoutable()) {
      pfrom.addrLocal = addrMe;
      SeenLocal(addrMe);
    }
    // Disconnect if we connected to ourself
    if (nNonce == nLocalHostNonce && nNonce > 1) {
      console.log('connected to self at pfrom');
      pfrom.fDisconnect = true;
      return true;
    }

    // Be shy don't send version until we hear
    if (pfrom.fInbound)
      pfrom.PushVersion();

    pfrom.fClient = !(pfrom.nServices & NODE_NETWORK);

    AddTimeData(pfrom.addr, nTime);

    // Change version
    pfrom.PushMessage("verack");
    pfrom.vSend.SetVersion(Math.min(pfrom.nVersion, PROTOCOL_VERSION));

    if (!pfrom.fInbound) {
      // Advertise our address
      if (!fNoListen && !IsInitialBlockDownload()) {
        let addr = GetLocalAddress(pfrom.addr);
        if (addr.IsRoutable())
          pfrom.PushAddress(addr);
      }
      // Get recent addresses
      if (pfrom.fOneShot || pfrom.nVersion >= CADDR_TIME_VERSION || addrman.length < 1000) {
        pfrom.PushMessage('getaddr');
        pfrom.fGetAddr = true;
      }
      addrman.Good(pfrom.addr);
    } else {
      if ((pfrom.addr == addrFrom) { // (CNetAddr)pfrom->addr, (CNetAddr)addrFrom
          addrman.Add(addrFrom, addrFrom);
          addrman.Good(addrFrom);
      }
    }
    // Ask the first connected node for block updates
    let nAskedForBlocks = 0;
    if (!pfrom.fClient && !pfrom.fOneShot && (pfrom.nVersion < NOBLKS_VERSION_START || pfrom.nVersion >= NOBLKS_VERSION_END) && (nAskedForBlocks < 1 || vNodes.length <= 1)) {
      nAskedForBlocks++;
      pfrom.PushGetBlocks(pindexBest, uint256(0));
    }

    // Relay alerts
    // LOCK(cs_mapAlerts)
    Object.keys(mapAlerts).forEach(function(key) {
      mapAlerts[key].RelayTo(pfrom);
    });

    pfrom.fSuccessfullyConnected = true;

    console.log('receive version message');

    cPeerBlockCounts.input(pfrom.nStartingHeight);
  } else if (pfrom.nVersion == 0) {
    pfrom.Misbehaving(1);
    return false;
  } else if (strCommand == 'verack') {
    pfrom.vRecv.SetVersion(Math.min(pfrom.nVersion, PROTOCOL_VERSION));
  } else if (strCommand == 'addr') {
    let vAddr = [ ]; // vector<CAddress>
    vRecv.push(vAddr);

    // Don't want addr from older version unless seeding
    if (pfrom.nVersion < CADDR_TIME_VERSION && addrman.length > 1000)
      return true;
    if (vAddr.length > 1000) {
      pfrom.Misbehaving(20);
      throw Error(`message addr size`);
    }

    // Store the new addresses
    let vAddrOk = [ ]; // vector<CAddress>
    let nNow = GetAdjustedTime();
    let nSince = nNow - 10 * 60;
    vAddr.forEach(function(addr) {
      if (fShutdown)
        return true;
      if (addr.nTime <= 1000000000 || addr.nTime > nNow + 10 * 60)
        addr.nTime = nNow - 5 * 24 * 60 * 60;
      pfrom.AddAddressKnown(addr);
      let fReachable = IsReachable(addr);
      if (addr.nTime > nSince && !pfrom.fGetAddr && vAddr.length <= 10 && addr.IsRoutable()) {
        // Relay to a limited number of other node
        // LOCK(cs_vNodes);
        let hashSalt = 0; // uint256 hashSalt;
        if (hashSalt == 0)
          hashSalt = GetRandHash();
        let hashAddr = addr.GetHash();
        let hashRand = hashSalt ^ (hashAddr<<32) ^ ((GetTime() + hashAddr) / (24 * 60 * 60 ));
        // hashRand = Hash(BEGIN(hashRand), END(hashRand));
        let mapMix = [ ]; // multimap<uint256, CNode>
        vNodes.forEach(function(pnode) {
          if (pnode.nVersion < CADDR_TIME_VERSION)
            continue;
          let nPointer = 0;
          mamcpy(nPointer, pnode); // memcpy(&nPointer, &pnode, sizeof(nPointer))
          let hashKey = hashRand ^ nPointer;
          // hashKey = Hash(BEGIN(hashKey), END(hashKey));
          mapMix.push({ hashKey, pnode });
        });
        let nRelayNodes = fReachable ? 2 : 1; // limited relaying
        for (let i = 0; i < mapMix.length; i++) {
          mapMix[i][1].PushAddress(addr);
        }
      }
      // Do not store addresses outside our network
      if (fReachable)
        vAddrOk.push(addr);

    });
    addrman.Add(vAddrOk, pfrom.addr, 2 * 60 * 60);
    if (vAddr.length < 1000)
      pfrom.fGetAddr = false;
    if (pfrom.fOneShot)
      pfrom.fDisconnect = true;
  } else if (strCommand == 'inv') {
    let vInv = [ ]; // vector<CInv>
    // vRecv >> vInv;
    if (vInv.length > MAX_INV_SZ) {
      pfrom.Misbehaving(20);
      throw Error(`message inv size()`);
    }

    // find last block in inv vector
    let nLastBlock = -1;
    for (let nInv = 0; nInv < vInv.length; nInv++) {
      if (vInv[vInv.length - 1 - nInv].type == MSG_BLOCK) {
        nLastBlock = vInv.length - 1 - nInv;
        break;
      }
    }
    let txdb = new CTxDB("r");
    for (let nInv = 0; nInv < vInv.length; nInv++) {
      let inv = vInv[nInv];
      if (fShutdown)
        return true;
      pfrom.AddInventoryKnown(inv);

      let fAlreadyHave = AlreadyHave(txdb, inv);
      if (fDebug)
        console.log(`got inventory`);

      if (!fAlreadyHave)
        pfrom.AskFor(inv);
      else if (inv.type == MSG_BLOCK && !!mapOrphanBlocks[inv.hash])
        pfrom.PushGetBlocks(pindexBest, GetOrphanRoot(mapOrphanBlocks[inv.hash]));
      else if (nInv == nLastBlock) {
        pfrom.PushGetBlocks(mapBlockIndex[inv.hash], uint256(0));
        if (fDebug)
          console.log(`force request:`);
      }
      // track requests for our stuff
      Inventory(inv.hash);
    }
  } else if (strCommand == 'getdata') {
    let vInv = [ ]; // vector<CInv>
    // vRecv >> vInv;
    if (vInv.length > MAX_INV_SZ) {
      pfrom.Misbehaving(20);
      throw Error(`message get data size`);
    }

    if (fDebugNet || (vInv.length != 1))
      console.log(`message getdata size() =`);

    vInv.forEach(function(inv) {
      if (fShutdown)
        return true;
      if (fDebugNet || (vInv.length == 1))
        console.log(`received getdata for:`);
      if (inv.type == MSG_BLOCK) {
        let block = new CBlock();
        let key = mapBlockIndex[inv.hash];
        block.ReadFromDisk(key);
        pfrom.PushMessage("block", block);

        // trigger to send a getblocks request
        if (inv.hash == pfrom.hashContinue) {
          // bypass PushInventory
          let vInv = [ ]; // vector<CInv>
          vInv.push(new CInv(MSG_BLOCK, hashBestChain));
          pfrom.PushMessage("inv", vInv);
          pfrom.hashContinue = 0;
        }
      } else if (inv.IsKnownType()) {
        let pushed = false;
        // LOCK(cs_mapRelay)
        let key = mapRelay[inv];
        prfrom.PushMessage(inv.GetCommand(), key);
        pushed = true;

        if (!pushed && inv.type == MSG_TX) {
          // LOCK(mempool.cs)
          if (mempool.exist(inv.hash)) {
            let tx = mempool.lookup(inv.hash);
            let ss = new CDataStream(SER_NETWORK, PROTOCOL_VERSION);
            ss.reserve(1000);
            ss.push(tx);
            pfrom.PushMessage("tx", ss);
          }
        }
      }
      // Track requests for our stuff
      Inventory(inv.hash);
    })
  } else if (strCommand == 'getblocks') {
    let locator = new CBlockLocator();
    let hashStop = 0;
    vRecv = [ ...vRecv, locator, hashStop ];

    // Find the last block caller has in main chain
    let pindex = locator.GetBlockIndex();

    // Send rest of the chain
    if (pindex)
      pindex = pindex.pnext;
    let nLimit = 500;
    console.log(`get blocks limit`);
    for (; pindex; pindex = pindex.pnext) {
      if (pindex.GetBlockHash() == hashStop) {
        console.log(`getblocks stopping at`);
        break;
      }
      pfrom.PushInventory(new CInv(MSG_BLOCK, pindex.GetBlockHash()));
      if (--nLimit <= 0) {
        console.log(`getblocks stopping at limit`);
        pfrom.hashContinue = pindex.GetBlockHash();
        break;
      }
    }
  } else if (strCommand == 'getheaders') {
    let locator = new CBlockLocator();
    let hashStop = 0;
    vRecv = [ ...vRecv, locator, hashStop ];
    let pindex = null;
    if (locator.IsNull()) {
        pindex = mapBlockIndex[hashStop];
    } else {
      pindex = locator.GetBlockIndex();
      if (pindex)
        pindex = pindex.pnext;
    }

    let vHeaders = [ ]; // vector<CBlock>
    let nLimit = 2000;
    console.log('getheaders to ');
    for (; pindex; pindex = pindex.pnext) {
      vHeaders.push(pindex.GetBlockHeader());
      if (--nLimit <= 0 || pindex.GetBlockHash() == hashStop)
        break;
    }
    pfrom.PushMessage("headers", vHeaders);
  } else if (strCommand == 'tx') {
    let vWorkQueue = [ ];
    let vEraseQueue = [ ];
    let vMsg = new CDataStream(vRecv);
    let txdb = new CTxDB("r")
    let tx = new CTransaction();
    vRecv.push(tx);
    let inv = new CInv(MSG_TX, tx.GetHash());
    pfrom.AddInventoryKnown(inv);

    let fMissingInputs = false;
    if (tx.AcceptToMemoryPool(txdb, true, fMissingInputs)) {
      SyncWithWallets(tx, null, true);
      RelayMessage(inv, vMsg);
      delete mapAlreadyAskedFor[inv];
      vWorkQueue.push(inv.hash);
      vEraseQueue.push(inv.hash);

      // recursively process orphan transactions
      for (let i = 0; i < vWorkQueue.length; i++) {
        let hashPrev = vWorkQueue[i];
        let vMsg = mapOrphanTransactionsByPrev[hashPrev];
        let tx = new CTransaction();
        // CDataStream(vMsg) >> tx;
        let inv = new CInv(MSG_TX, tx.GetHash());
        vMsg.push(tx); //
        let fMissingInputs2 = false;

        if (tx.AcceptToMemoryPool(txdb, true, fMissingInputs2)) {
          console.log('accepted orphan tx');
          SyncWithWallets(tx, null, true);
          RelayMessage(inv, vMsg);
          delete mapAlreadyAskedFor[inv];
          vWorkQueue.push(inv.hash);
          vEraseQueue.push(inv.hash);
        } else if (!fMissingInputs2) {
          // invalid orphan
          vEraseQueue.push(inv.hash);
          console.log(`removed invalid orphan tx`);
        }
      }
      vEraseQueue.forEach(function(hash) {
        EraseOrphanTx(hash);
      });
    } else if (fMissingInputs) {
      AddOrphanTx(vMsg);
      // DoS prevention
      let nEvicted = LimitOrphanTxSize(MAX_ORPHAN_TRANSACTIONS);
      if (nEvicted > 0)
      console.log(`mapOrphan overflow removed`);
    }
    if (tx.nDoS) pfrom.Misbehaving(tx.nDoS);
    }
  } else if (strCommand == 'block') {
    let block = new CBlock();
    vRecv.push(block);

    console.log(`received block`);

    let inv = new CInv(MSG_BLOCK, block.GetHash());
    pfrom.AddInventoryKnown(inv);

    if (ProcessBlock(pfrom, block))
      delete mapAlreadyAskedFor[inv];
    if (block.nDoS)
      pfrom.Misbehaving(block.nDoS);
  } else if (strCommand == 'getaddr') {
    pfrom.vAddrToSend.clear();
    let vAddr = addrman.GetAddr();
    vAddr.forEach(function(addr) {
      pfrom.PushAddress(addr);
    })
  } else if (strCommand == 'mempool') {
    let vtxid = [ ];
    mempool.queryHashes(vtxid);
    let vInv = [ ]; // vector<CInv>
    for (let i = 0; i < vtxid.length; i++) {
      let inv = new CInv(MSG_TX, vtxid[i]);
      vInv.push(inv);
      if (i == (MAX_INV_SZ - 1))
        break;
    }
    if (vInv.length > 0)
      pfrom.PushMessage("inv", vInv);
  } else if (strCommand == 'checkorder') {
    let hashReply = 0;
    vRecv.push(hashReply);

    if (!GetBoolArg("-allowreceivebyip")) {
      pfrom.PushMessage("reply", hashReply, 2, "");
      return true;
    }

    let order = new CWalletTx();
    vRecv.push(order);

    // chance to check order

    if (!mapReuseKey[pfrom.addr])
      pwalletMain.GetKeyFromPool(mapReuseKey[pfrom.addr], true);

    // send approval of order and pubkey to use
    let scriptPubKey = new CScript();
    // scriptPubKey << mapReuseKey[pfrom.addr] << OP_CHECKSIG;
    pfrom.PushMessage("reply", hashReply, 0, scriptPubKey);
  } else if (strCommand == 'reply') {
    let hashReply = 0;
    vRecv.push(hashReply);

    let tracker = new CRequestTracker();
    // LOCK(pfrom.cs_mapRequests)
    tracker = pfrom.mapRequests[hashReply];
    delete pfrom.mapRequests[hashReply];
    if (!tracker.IsNull())
      tracker.fn(tracker.param1, vRecv);
  }

  else if (strCommand == 'ping') {
    if (pfrom.nVersion > BIP0031_VERSION) {
      let nonce = 0;
      vRecv.push(nonce);
      // Echo message with nonce
      pfrom.PushMessage("pong", nonce);
    }
  }

  else if (strCommand === 'alert') {
    let alert = new CAlert();
    vRecv.push(alert);

    let alertHash = alert.GetHash();

    if (pfrom.setKnown.count(alertHash) == 0) {
      if (alert.ProcessAlert()) {
        // Relay
        pfrom.setKnown.insert(alertHash);
        // LOCK(cs_vNodes)
        vNodes.forEach(function(pnode)) {
          alert.RelayTo(pnode);
        }
      }
      else {
        // small DoS penalty
        pfrom.Misbehaving(10);
      }
    }
  }

  // Update last seen time for node's address
  if (pfrom.fNetworkNode)
    if (strCommand == 'version' || strCommand == 'addr' || strCommand == 'inv' || strCommand == 'getdata' || strCommand == 'ping')
      AddressCurrentlyConnected(pfrom.addr);

  return true;
}

function ProcessMessages(pfrom) {
  let vRecv = pfrom.vRecv;
  if (!vRecv.length)
    return true;
  while (true) {
    if (pfrom.vSend.length >= SendBufferSize())
      break;
    let nHeaderSize = vRecv.GetSerializeSize(CMessageHeader());
    if (vRecv[vRecv.length - 1] - pstart < nHeaderSize) {
      if (vRecv.length > nHeaderSize) {
        console.log('\n\n PROCESSMESSAGE MESSAGESTART NOT FOUND\n\n');
        vRecv = vRecv.slice(vRecv.length - 1 - nHeaderSize); // vRecv.erase(vRecv.begin(), vRecv.end() - nHeadSize)
      }
      break;
    }
    if (pstart - vRecv[0] > 0)
      console.log('\n\nPROCESSMESSAGE SKIPPED BYTES');
    vRecv = vRecv.slice(pstart + 1);

    // Read header
    let vHeaderSave = vRecv.slice(0, nHeaderSize);
    let hdr = new CMessageHeader();
    vRecv.push(hdr);
    if (!hdr.IsValid()) {
      console.log('\n\nPROCESSMESSAGE: ERRORS IN HEADER');
      continue;
    }
    let strCommand = hdr.GetCommand();

    // Message size
    let nMessageSize = hdr.nMessageSize;
    if (nMessageSize > MAX_SIZE) {
      console.log(`ProcessMessages : nMessageSize > MAX_SIZE\n`);
      continue;
    }
    if (nMessageSize > vRecv.length) {
      // Rewind and wait for rest of message
      vRecv = vRecv.concat(vHeaderSave);
      break;
    }
    // Checksum
    let hash = Hash(vRecv[0], vRecv[0] + nMessageSize);
    let nChecksum = 0;
    memcpy(nChecksum, hash, nChecksum.length);
    if (nChecksum != hdr.nChecksum) {
      console.log('ProcessMessages : CHECKSUM ERROR');
      continue;
    }

    // Copy message to its own buffer
    let vMsg = new CDataStream(vRecv[0], vRecv[0] + nMessageSize, vRecv.nType, vRecv.nVersion);
    vRecv.ignore(nMessageSize);

    // Process message
    let fRet = false;
    // LOCK(cs_main);
    fRet = ProcessMessage(pfrom, strCommand, vMsg);
    if (fShutdown)
      return true;
    if (!fRet)
      console.log(`ProcessMessage FAILED`);
  }
  vRecv.Compact();
  return true;
}

function SendMessages(pto, fSendTrickle) {
  // TRY_LOCK(cs_main, lockMain);
  if (pto.nVersion == 0)
    return true;
  // Keep alive ping
  if (pto.nLastSend && GetTime() - pto.nLastSend > 30 * 60 !pto.vSend.length) {
    let nonce = 0;
    if (pto.nVersion > BIP0031_VERSION)
      pto.PushMessage('ping', nonce);
    else
      pto.PushMessage('ping');
  }

  // Resend wallet transactions
  ResendWalletTransactions();

  // Address refresh broadcast
  let nLastRebroadcast = 0;
  if (!IsInitialBlockDownload() && (GetTime() - nLastRebroadcast > 24 * 60 * 60)) {
    // LOCK(cs_vNodes)
    vNodes.forEach(function(pnode) {
      if (nLastRebroadcast)
        pnode.setAddrKnown.clear();
      // Rebroadcast our address
      if (!fNoListen) {
        let addr = GetLocalAddress(pnode.addr);
        if (addr.IsRoutable())
          pnode.PushAddress(addr);
      }
    });
    nLastRebroadcast = GetTime();
  }
  // Message: addr
  if (fSendTrickle) {
    let vAddr = [ ]; // vector<CAddress>
    pto.vAddrToSend.forEach(function(addr) {
      if (pto.setAddrKnown.insert(addr).second) {
        vAddr.push(addr);
        // receiver rejects messages larger than 1000
        if (vAddr.length >= 1000) {
          pto.PushMessage("addr", vAddr);
          vAddr.clear();
        }
      }
    });
    pto.vAddrToSend.clear();
    if (!!vAddr.length)
      pto.PushMessage("addr", vAddr);
  }

  // Message: inventory
  let vInv = [ ]; // vector<CInv>
  let vInvWait = [ ]; // vector<CInv>
  // LOCK(pto.cs_inventory);
  pto.vInventoryToSend.forEach(function(inv) {
    if (pto.setInventoryKnown[inv])
      continue;

    // trickle out tx inv to protect privacy
    if (inv.type == MSG_TX && !fSendTrickle) {
      // 1/4 of tx invs blast to all immediately
      let hashSalt = 0;
      if (hashSalt == 0)
        hashSalt = GetRandHash();
      let hashRand = inv.hash ^ hashSalt;
      hashRand = Hash(hashRand);
      let fTrickleWait = ((hashRand & 3) != 0);

      // always trickle own transactions
      if (!fTrickleWait) {
        let wtx = new CWalletTx();
        if (GetTransaction(inv.hash, wtx))
          if (wtx.fFromMe)
            fTrickleWait = true;
      }

      if (fTrickleWait) {
        vInvWait.push(inv);
        continue;
      }
    }

    // returns true if wasn't already contained in set
    if (pto.setInventoryKnown.insert(inv).second) {
      vInv.push(inv);
      if (vInv.length >= 1000) {
        pto.PushMessage("inv", vInv);
        vInv.clear();
      }
    }
    pto.vInventoryToSend = vInvWait;
  });

  if (!!vInv.length)
    pto.PushMessage("inv", vInv);

  // Message: getdata
  let vGetData = [ ]; // vector<CInv>
  let nNow = GetTime() * 1000000;
  let txdb = new CTxDB("r");
  while (!!pto.mapAskFor.length && (pto.mapAskFor[0] <= nNow)) {
    let inv = pto.mapAskFor[0];
    if (!AlreadyHave(txdb, inv)) {
      if (fDebugNet)
        console.log('sending getdata: ');
      vGetData.push(inv);
      if (vGetData.length >= 1000) {
        pto.PushMessage('getdata', vGetData);
        vGetData.clear();
      }
      mapAlreadyAskedFor[inv] = nNow;
    }
    pto.mapAskFor.erase(pto.mapAskFor.begin());
  }
  if (!!vGetData)
    pto.PushMessage('getdata', vGetData);
  return true;
}


//////////////////////////////////////
//
// BitcoinMiner
//

function FormatHashBlocks(pbuffer, len) {
  let pdata = pbuffer;
  let blocks = 1 + ((len + 8) / 64);
  let pend = pdata + 64 * blocks;
  memset(pdata + len, 0, 64 * blocks - len);
  pdata[len] = 0x80;
  let bits = len * 8;
  pend[pend.length - 1] = (bits >> 0) & 0xff;
  pend[pend.length - 2] = (bits >> 8) & 0xff;
  pend[pend.length - 3] - (bits >> 16) & 0xff;
  pend[pend.length - 4] - (bits >> 24) & 0xff;
  return blocks;
}

const pSHA256InitState = [ 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 ];

function SHA256Transform(pstate, pinput, pinit) {
  let ctx;
  let data = [ ];
  SHA256_Init(ctx);

  for (let i = 0; i < 16; i++)
    data[i] = ByteReverse(pinput[i]);

  for (let i = 0; i < 8; i++)
    ctx.h[i] = pinit[i];

  SHA256_Update(ctx, data, data.length);
  for (let i = 0; i < 8; i++)
    pstate[i] = ctx.h[i];
}

function ScanHash_CryptoPP(pmidstate, pdata, phash1, phash, nHashesDone) {
  let nNonce = pdata + 12;
  for (;;) {
    // Crypto ++ SHA256
    nNonce++;
    SHA256Transform(phash1, pdata, pmidstate);
    SHA256Transform(phash, phash1, pSHA256InitState);

    // Return the nonce
    if (phash[14] == 0)
      return nNonce;

    // if nothing return -1
    if (nNonce & 0xffff == 0) {
      nHashesDone = 0xffff+1;
      return -1;
    }
  }
}

// Some explaining
class COrphan {
  constructor(ptxIn) {
    this.ptx = ptxIn;
    this.dFeePerKb = 0;
    this.setDependsOn = new Set();
    this.dPriority = 0;
  }
  print() {
    console.log(`COrphan(hash=${this.ptx.GetHash().ToString()})`);
  }
}

let nLastBlockTx = 0;
let nLastBlockSize = 0;

// We want to sort transactions by priority and fee, so:

class TxPriorityCompare {
  constructor(byFeeIn) {
    this.byFee = byFeeIn;
  }
  operator(a, b) {
    if (this.byFee) {
      return a[0] < b[0];
    } else {
      return a[1] < b[1];
    }
  }
}

const pszDummy = "\0\0";

function CreateNewBlock() { }
function IncrementExtraNonce() { }
function FormatHashBuffers() { }
function CheckWork() { }
function ThreadBitcoinMiner() { }

let fGenerateBitcoins = false;
let fLimitProcessors = false;
let nLimitProcessors = -1;

function BitcoinMiner() { }
function ThreadBitcoinMiner() { }
function GenerateBitcoins() { }
