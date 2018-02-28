const CBlock = require('./Cblock');
const CTxIndex = require('./CTxIndex');
const CTxDB = require('./CTxDB');
const CTransaction = require('./CTransaction');

class CMerkleTx extends CTransaction {
  constructor(hashBlockIn, nIndexIn, fMerkleVerifiedIn) {
    super();
    this.hashBlock = hashBlockIn || 0;
    this.nIndex = nIndexIn || -1;
    this.fMerkleVerified = fMerkleVerifiedIn || false;
  }
  SetMerkleBranch(pblock = null) {
    let fClient = true; // TODO: where is this initiated?
    if (fClient) {
      if (this.hashBlock === 0) {
        return 0;
      }
    } else {
      let blockTmp = new CBlock();
      if (pblock == null) {
        // load block this transaction is in
        let txindex = new CTxIndex();
        if (!CTxDB("r").ReadTxIndex(this.GetHash(), txindex)) {
          return 0;
        }
        pblock = blockTmp;
      }
      let vMerkleBranch;
      let hashBlock = pblock.GetHash();
      for (let nindex = 0; nindex < pblock.vtx.length; nindex++) {
        if (pblock.vtx[nindex] == this) {
          break;
        }
        if (nindex == pblock.vtx.length) {
          // vMerkleBranch.clear();
          nindex = -1;
          console.log('ERROR: SetMerkleBranch() : couldnt find tx in block\n');
          return 0;
        }
        vMerkleBranch = pblock.GetMerkleBranch(nindex);
      }
    }
    // TODO: how to translate?
    // map::iterator mi = mapBlockIndex.find(hashBlock);
    // if (mi == mapBlockIndex.end())
    //  return 0;
    // CBlockIndex* pindex = (*mi).second;
    // if (!pindex || !pindex.IsInMainChain())
    //  return 0;
    // return pindexBest.nHeight - pindex.nHeight + 1;
  }
  GetDepthInMainChain(pindexRet) {
    if (this.hashBlock === 0 || this.nIndex === -1) {
      return 0;
    }
    // find hash block iterator in mapBlockIndex
    // CBlockIndex* pindex = (*mi).second;
    // if (!pindex || !pindex->IsInMainChain()) { return 0; } TODO: understand this better
    let pindex = mapBlockIndex.find(this.hashBlock);
    if (!pindex || !pindex.IsInMainChain()) {
      return 0;
    }
    if (!this.fMerkleVerified) {
      let block = new Block();
      if (block.CheckMerkleBranch(this.GetHash(), this.vMerkleBranch, this.nIndex) != pindex.hashMerkleRoot) {
        return 0;
      }
      fMerkleVerified = true;
    }
    pindexRet = pindex;
    return pindexBest.nHeight - pindex.nHeight + 1;
  }
  GetBlocksToMaturity() {
    if (this.IsCoinBase()) {
      return 0;
    }
    return Math.max(0, (COINBASE_MATURITY + 20) - this.GetDepthInMainChain());
  }
  // v1
  AcceptToMemoryPool(txdb, fCheckInputs = true) {
    if (fClient) {
      if (!this.IsInMainChain() && !ClientConnectInputs()) {
        return false;
      }
      let tx = new CTransaction()
      return tx.AcceptToMemoryPool(txdb, false);
    } else {
      return tx.AcceptToMemoryPool(txdb, fCheckInputs);
    }
  }
  // v2
  AcceptToMemoryPool() {
    let txdb = new CTxDB("r");
    return this.AcceptToMemoryPool(txdb);
  }
  IsInMainChain() { }
}

module.exports = CMerkleTx;
