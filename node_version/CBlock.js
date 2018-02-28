const Constants = require('./constants');

const { CURRENT_VERSION } = Constants;

class CBlock {
  constructor(nVersion, hashPrevBlock, hashMerkleRoot, nTime, nBits, nNonce, vtx, vMerkleTree, nDoS) {
    this.nVersion = nVersion || CURRENT_VERSION;
    this.hashPrevBlock = hashPrevBlock;
    this.hashMerkleRoot = hashMerkleRoot;
    this.nTime = nTime;
    this.nBits = nBits;
    this.nNonce = nNonce;
    this.vtx = vtx || [];
    this.vMerkleTree = vMerkleTree || [];
    this.nDoS = nDoS;
  }
  GetHash() {
    return ''; // TODO: return Hash(BEGIN(nVersion), END(nNonce))
  }
  GetBlockTime() {
    return this.nTime;
  }
  UpdateTime(pindexPrev) { }
  BuildMerkleTree() {
    this.vMerkleTree = [];
    this.vtx.forEach(tx => {
      this.vMerkleTree.push(tx.GetHash());
    })
    let j = 0;
    for (let nSize = this.vtx.length; nSize > 1; nSize = (nSize + 1) / 2) {
      for (let i = 0; i < nSize; i += 2) {
        let i2 = Math.min(i+1, nSize-1);
        const hash = ''; // TODO: hash = Hash(BEGIN(vMerkleTree[j+i]), END(vMerkleTree[j+i]), BEGIN(vMerkleTree[j+i2]), END(vMerkleTree[j+i2]))
        this.vMerkleTree.push(hash);
      }
      j += nSize;
    }
    return (this.vMerkleTree.length === 0 ? 0 : this.vMerkleTree[this.vMerkleTree.length-1]); // TODO: / vMerkleTree.back()
  }
  GetMerkleBranch(nIndex) {
    if (this.vMerkleTree.length === 0) {
      this.BuildMerkleTree();
    }
    let vMerkleBranch = [ ];
    let j = 0;
    for (let nSize = this.vtx.length; nSize > 1; nSize = (nSize + 1) / 2) {
      let i = Math.min(nIndex, nSize-1);
      vMerkleBranch.push(this.vMerkleTree[j+i]);
      nIndex >> 1;
      j += nSize;
    }
    return vMerkleBranch;
  }
  CheckMerkleBranch(hash, vMerkleBranch, nIndex) {
    if (nIndex === -1) {
      return 0;
    }
    vMerkleBranch.forEach(otherside => {
      if (nIndex & 1) {
        hash = ''; // TODO: hash = Hash(BEGIN(otherside), END(otherside), BEGIN(hash), END(hash))
      } else {
        hash = ''; // TODO: hash = Hash(BEGIN(hash), END(hash), BEGIN(otherside), END(otherside))
      }
    });
    return hash;
  }
  ReadFromDisk(pindex, fReadTransactions) {
    if (!fReadTransactions) {
      this = pindex.GetBlockHeader();
      return true;
    }
    if (!this.ReadFromDisk(pindex.nFile, pindex.nBlockPos, fReadTransactions)) {
      return false;
    }
    if (this.GetHash() != pindex.GetBlockHash()) {
      throw Error(`CBlock::ReadFromDisk() : GetHash() doesn't match index`);
    }
    return true;
  }
  UpdateTime(pindexPrev) {
    this.nTime = Math.max(pindexPrev.GetMedianTimePast() + 1, this.GetAdjustedTime())
    if (fTestNet) {
      this.nBits = GetNextWorkRequired(pindexPrev, this);
    }
  }
  GetAdjustedTime() { }
  WriteToDisk() { }
  DisconnectBlock(txdb, pindex) {
    for (let i = this.vtx.length - 1; i >= 0; i--) {
      if (!vtx[i].DisconnectInputs(txdb)) {
        return false;
      }
    }
    if (pindex.pprev) {
      let blockindexPrev = new CDiskBlockIndex(pindex.pprev); // TODO: define class CDiskBlockIndex
      blockindexPrev.hashNext = 0;
      if (!txdb.WriteBlockIndex(blockindexPrev)) {
        throw Error(`DisconnectBlock() : WriteBlockIndex failed`);
      }
    }
    return true;
  }
  ConnectBlock(txdb, pindex, fJustCheck=false) {
    if (!this.CheckBlock(!fJustCheck, !fJustCheck)) {
      return false;
    }
    let fEnforceBIP30 = !((pindex.nHeight==91842 && pindex.GetBlockHash() == uint256("0x00000000000a4d0a398161ffc163c503763b1f4360639393e0e4c8e300e0caec") ||
                          (pindex.nHeight==91880 && pindex.GetBlockHash() == uint256("0x00000000000743f190a18c5577a3c2d2a1f610ae9601ac046a38084ccb7cd721"))));
    let nBIP16SwitchTime = 1333238400; // BIP16 active on Apr 1 2012
    let fStrictPayToScriptHash = (pindex.nTime >= nBIP16SwitchTime);
    let nTxPos = 0;
    if (fJustCheck) {
      nTxPos = 1;
    } else {
      nTxPos = pindex.nBlockPos + this.GetSerializeSize(CBlock(), SER_DISK, CLIENT_VERSION) - 1 + this.GetSizeOfCompactSize(vtx.length);
    }
    let mapQueuedChanges = { }; // <uint256, CTxIndex>
    let nFees = 0;
    let nSigOps = 0;
    this.vtx.forEach(function(tx) {
      let hashTx = tx.GetHash();
      if (fEnforceBIP30) {
        let txindexOld = new CTxIndex();
        if (txdb.ReadTxIndex(hashTx, txindexOld)) {
          txindexOld.vSpent.forEach(function(pos) {
            if (pos == null) {
              return false;
            }
          });
        }
      }
      nSigOps += tx.GetLegacySigOpCount();
      if (nSigOps > MAX_BLOCK_SIGOPS) {
        throw Error(`ConnectBlock() : too many sigops`);
      }
      let posThisTx = new CDiskTxPos(pindex.nFile, pindex.nBlockPos, nTxPos);
      if (!fJustCheck) {
        nTxPos += this.GetSerializeSize(tx, SER_DISK, CLIENT_VERSION);
      }
      let mapInputs = { }; // MapPrevTx
      if (!tx.IsCoinBase()) {
        let fIvalid = false;
        if (!tx.FetchInputs(txdb, mapQueuedChanges, true, false, mapInputs, fInvalid)) {
          return false;
        }
        if (fStrictPayToScriptHash) {
          nSigOps += tx.GetP2SHSigOpCount(mapInputs);
          if (nSigOps > MAX_BLOCK_SIGOPS) {
            throw Error(`ConnectBlock() : too many sigops`);
          }
        }
        nFees += tx.GetValueIn(mapInputs) - tx.GetValueOut();
        if (!tx.ConnectInputs(mapInputs, mapQueuedChanges, posThisTx, pindex, true, false, fStrictPayToScriptHash)) {
          return false;
        }
      }
      mapQueuedChanges[hashTx] = new CTxIndex(posThisTx, tx.vout.length);
    });
    if (vtx[0].GetValueOut() > this.GetBlockValue(pindex.nHeight, nFees))
      return false;
    if (fJustCheck)
      return true;
    for (let i = 0; i < Object.keys(mapQueuedChanges).length; i++) {
      if (!txdb.UpdateTxIndex(Object.keys[i], mapQueuedChanges[Object.keys[i]]))
        throw Error(`ConnectBlock() : UpdateTxIndex failed`);
    }
    if (pindex.pprev) {
      let blockindexPrev = new CDiskBlockIndex(pindex.pprev);
      blockindexPrev.hashNext = pindex.GetBlockHash();
      if (!txdb.WriteBlockIndex(blockindexPrev))
        throw Error(`ConnectBlock() : WriteBlockIndex failed`);
    }
    this.vtx.forEach(function(tx) {
      this.SyncWithWallets(tx, this, true);
    });
    return true;
  }
  SetBestChainInner(txdb, pindexNew) {
    let hash = this.GetHash();
    if (!this.ConnectBlock(txdb, pindexNew) || txdb.WriteHashBestChain(hash)) {
      txdb.TxnAbort();
      this.InvalidChainFound(pindexNew);
      return false;
    }
    if (!txdb.TxnCommit())
      throw Error(`SetBestChain() : TxnCommit failed`);
    // Add to current best branch
    pindexNew.pprev.pnext = pindexNew;

    // Delete redundant memory transactions
    this.vtx.forEach(function(tx) {
      mempool.remove(tx);
    });
    return true;
  }
  SetBestChain(txdb, pindexNew) {
    let hash = this.GetHash();
    if (!txdb.TxnBegin())
      throw Error(`SetBestChain() : TxnBegin failed`);

    if (pindexGenesisBlock == null && hash == hashGenesisBlock) {
      txdb.WriteHashBestChain(hash);
      if (!txdb.TxnCommit())
        throw Error(`SetBestChain() : TxnCommit failed`);
      pindexGenesisBlocks = pindexNew;
    } else if (hashPrevBlock == hashBestChain) {
      if (!this.SetBestChainInner(txdb, pindexNew))
        throw Error(`SetBestChain() : SetBestChainInner failed`);
    } else {
      let pindexIntermediate = pindexNew;
      // list of blocks that need to be connected afterwards
      let vpindexSecondary = [ ];
      // Reorganize is costly, limit how much needs to be done
      while (pindexIntermediate.pprev && pindexIntermediate.pprev.bnChainWork > pindexBest.bnChainWork) {
        vpindexSecondary.push(pindexIntermediate);
        pindexIntermediate = pindexIntermediate.pprev;
      }
      if (!vpindexSecondary.length == 0)
        console.log(`Postponing reconnects\n`);
      // switch to new best branch
      if (!this.Reorganize(txdb, pindexIntermediate)) {
        txdb.TxnAbort();
        this.InvalidChainFound(pindexNew);
        throw Error(`SetBestChain() : Reorganize failed`);
      }
      // Connect further blocks
      vpindexSecondary.forEach(function(pindex) {
        let block = new CBlock();
        if (!block.ReadFromDisk(pindex)) {
          console.log(`SetBestChain() : ReadFromDisk failed\n`);
          break;
        }
        if (!txdb.TxnBegin()) {
          console.log(`SetBestChain() : TxnBegin failed\n`);
          break;
        }
        // errors now are not fatal
        if (!block.SetBestChainInner(txdb, pindex))
          break;
      });
    }
    let fIsInitialDownload = this.IsInitialBlockDownload();
    if (!fIsInitialDownload) {
      let locator = new CBlockLocator(pindexNew);
      this.SetBestChain(locator);
    }
    // new best block
    hashBestChain = hash;
    pindexBest = pindexNew;
    pblockindexFBBHLast = null;
    nBestHeight = pindexBest.nHeight;
    bnBestChainWork = pindexNew.bnChainWork;
    nTimeBestReceived = this.GetTime();
    nTransactionsUpdated++;
    console.log(`SetBestChain: new best height, work, date`);
    if (!fIsInitialDownload) {
      let nUpgraded = 0;
      const pindex = pindexBest;
      for (let i = 0; i < 100 && pindex != null; i++) {
        if (pindex.nVersion > CURRENT_VERSION)
          ++nUpgraded;
        pindex = pindex.pprev;
      }
      if (nUpgraded > 0)
        console.log(`SetBestChain: of last 100 blocks above version`);
      if (nUpgraded > 100/2)
        strMiscWarning = `Warning: This version is obsolete, upgrade required!`;
    }
    let strCmd = this.GetArg("-blocknotify", "");
    if (!fIsInitialDownload && !strCmd.length) {
      /* TODO:
      boost::replace_all(strCmd, "%s", hashBestChain.GetHex());
      boost::thread t(runCommand, strCmd); // thread runs free
      */
    }
    return true;
  }
  AddToBlockIndex(nFile, nBlockPos) {
    let hash = this.GetHash();
    if (mapBlockIndex[hash])
      throw Error(`AddToBlockIndex() : already exists`);

    // construct new block index object
    let pindexNew = new CBlockIndex(nFile, nBlockPos, this);
    if (!pindexNew)
      throw Error(`AddToBlockIndex() : new CBlockIndex failed`);
    mapBlockIndex[hash] = pindexNew;
    pindexNew.phashBlock = hash;
    pindexNew.pprev = mapBlockIndex[this.hashPrevBlock];
    pindexNew.nHeight = pindexNew.pprev.nHeight + 1;

    pindexNew.bnChainWork = (pindexNew.pprev ? pindexNew.pprev.bnChainWork : 0) + pindexNew.GetBlockWork();
    let txdb = new CTxDB();
    if (!txdb.TxnBegin())
      return false;
    txdb.WriteBlockIndex(new CDiskBlockIndex(pindexNew));
    if (!txdb.TxnCommit())
      return false;

    // new best
    if (pindexNew.bnChainWork > bnBestChainWork) {
      if (!this.SetBestChain(txdb, pindexNew))
        return false;
    }
    txdb.Close();
    if (pindexNew == pindexBest) {
      // Notify UI to display prev block's coinbase if ours
      let hashPrevBestCoinBase = 0;
      this.UpdatedTransaction(hashPrevBestCoinBase);
      hashPrevBestCoinBase = this.vtx[0].GetHash();
    }
    uiInterface.NotifyBlocksChange();
    return true;
  }
  CheckBlock(fCheckPOW, fCheckMerkleRoot) {
    // checks independent of context
    // size limits
    if (!this.vtx.length || this.vtx.length > MAX_BLOCK_SIZE || this.GetSerializeSize(this, SER_NETWORK, PROTOCOL_VERSION) > MAX_BLOCK_SIZE)
      throw Error(`CheckBlock() : size limits failed`);
    // check POW matches
    if (fCheckPOW && !this.CheckProofOfWork(this.GetHash(), this.nBits))
      throw Error(`CheckBlock() : proof of work failed`);
    // check timestamp
    if (this.GetBlockTime() > this.GetAdjustedTime() + 2 * 60 * 60)
      throw Error(`CheckBlock() : block timestamp too far in the future`);

    // first transaction must be coinbase, rest not
    if (!this.vtx.length || !vtx[0].IsCoinbase())
      throw Error(`CheckBlock() : first tx is not coinbase`);
    for (let i = 1; i < this.vtx.length; i++) {
      if (vtx[i].IsCoinBase())
        throw Error(`CheckBlock() : more than one coinbase`);
    }
    this.vtx.forEach(function(tx) {
      if (!tx.CheckTransaction())
        throw Error(`CheckBlock() : CheckTransaction failed`);
    });
    let uniqueTx = new Set();
    this.vtx.forEach(function(tx) {
      uniqueTx.add(tx.GetHash());
    });
    if (uniqueTx.size != vtx.length)
      throw Error(`CheckBlock() : duplicate transaction`);

    let nSigOps = 0;
    this.vtx.forEach(function(tx) {
      nSigOps += tx.GetLegacySigOpCount();
    });
    if (nSigOps > MAX_BLOCK_SIGOPS)
      throw Error(`CheckBlock() : out of bounds SigOpCount`);

    // check merkle root
    if (fCheckMerkleRoot && this.hashMerkleRoot != this.BuildMerkleTree())
      throw Error(`CheckBlock() : hashMerkleRoot mismatch`);

    return true;
  }
  AcceptBlock() {
    let hash = this.GetHash();
    if (mapBlockIndex[hash])
      throw Error(`AcceptBlock() : block already in mapBlockIndex`);
    // get prev block index
    let pindexPrev = mapBlockIndex[this.hashPrevBlock];
    if (!pindexPrev)
      throw Error(`AcceptBlock() : prev block not found`);
    let nHeight = pindexPrev.nHeight + 1;

    // check POW
    if (this.nBits != this.GetNextWorkRequired(pindexPrev, this))
      throw Error(`AcceptBlock() : incorrect proof of work`);

    // check timestamp
    if (this.GetBlockTime() <= pindexPrev.GetMedianTimePast())
      throw Error(`AcceptBlock() : block's timestamp is too early`);
    // check that transactions are finalized
    this.vtx.forEach(function(tx) {
      if (!tx.IsFinal(nHeight, this.GetBlockTime()))
        throw Error(`AcceptBlock() : contains a non-final transaction`);
    });
    // check that block chain matches known block chain up to a checkpoint
    if (!Checkpoints.CheckBlock(nHeight, hash))
      throw Error(`AcceptBlock() : rejected by checkpoint lock-in at height`);
    // reject block.nVersion=1 blocks when 95% has upgraded
    if (nVersion < 2) {
      let blockindex = new CBlockIndex();
      if (!fTestNet && blockindex.IsSuperMajority(2, pindexPrev, 950, 1000)) || (fTestNet && blockindex.IsSuperMajority(2, pindexPrev, 75, 100))
        throw Error(`AcceptBlock() : rejected nVersion=1 block`);
    }
  }
  // enforce block.nVersion=2 rule that coinbase starts with serialized block height 
}


module.exports = CBlock;
