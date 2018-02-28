const CInPoint = require('./CInPoint');
const fTestNet = false; // TODO: import from main file

class CTxMemPool {
  constructor() {

  }
  accept(txdb, tx, fCheckInputs, pfMissingInputs) {
    if (pfMissingInputs) {
      pfMissingInputs = false;
    }
    if (!tx.CheckTransaction()) {
      throw Error('CTxMemPool::accept() : CheckTransaction failed');
    }
    if (tx.IsCoinBase()) {
      throw Error('CTxMemPool::accept() : coinbase as individual tx');
    }
    if (tx.nLockTime > 4294967295) {// std::numeric_limits::max()
      throw Error('CTxMemPool::accept() : not accepting nLockTime beyond 2038 yet');
    }
    if (!fTestNet && !tx.IsStandard()) {
      throw Error('CTxMemPool::accept() nonstandard transaction type');
    }
    let hash = tx.GetHash();
    if (!!mapTx[hash]) {
      return false;
    }
    if (fCheckInputs) {
      if (txdb.ContainsTx(hash)) {
        return false;
      }
    }
    let ptxOld = null;
    for (let i = 0; i < tx.vin.length; i++) {
      let outpoint = tx.vin[i].prevout;
      if (mapNextTx[outpoint]) { // TODO: pointer to mapNextTx;
        return false;
      }
    }
    if (fCheckInputs) {
      let mapInputs = new MapPrevTx();
      let mapUnused = { }; // <uint256, CTxIndex>
      if (!tx.FetchInputs(txdb, mapUnused, false, false, mapInputs, fInvalid)) {
        if (fInvalid) {
          throw Error(`CTxMemPool::accept() : FetchInputs found invalid tx ${hash.ToString().substr(0,10)}`);
        }
        if (pfMissingInputs) {
          pfMissingInputs = true;
        }
        return false;
      }
      if (!tx.AreInputsStandard(mapInputs) && !fTestNet) {
        throw Error(`CTxMemPool::accept() : nonstandard transaction input`);
      }
      let nFees = tx.GetValueIn(mapInputs) - tx.GetValueOut();
      let nSize = this.GetSerializeSize(tx, SER_NETWORK, PROTOCOL_VERSION);
      if (nFees < tx.GetMinFee(1000, true, GMF_RELAY)) {
        throw Error(`CTxMemPool::accept() : not enough fees`);
      }
      if (nFees < MIN_RELAY_TX_FEE) {
        let cs = null; // CCriticalSection
        let dFreeCount = 0;
        let nLastTime = 0;
        let nNow = Date.now();
        // LOCK(cs); // threading
        dFreeCount += Math.pow(1.0 - 1.0/600.0, nNow - nLastTime);
        nLastTime = nNow;
        if (dFreeCount > GetArg("-limitfreerelay", 15) * 10 * 1000 && !IsFromMe(tx)) {
          throw Error(`CTxMemPool::accept() : free transaction rejected by rate limiter`);
        }
        if (fDebug) {
          console.log(`Rate limit dFreeCount : ${dFreeCount} => ${dFreeCount + nSize\n}`);
        }
        dFreeCount += nSize;
      }
      if (!tx.ConnectInputs(mapInputs, mapUnused, CDiskTxPos(1,1,1), pindexBest, false, false)) {
        throw Error(`CTxMemPool::accept() : ConnectInputs failed ${hash.ToString().substr(0,10)}`);
      }
    }
    // LOCK(cs)
    if (ptxOld) {
      console.log(`CTxMemPool::accept() : replacing tx ${ptxOld.GetHash().ToString()} with new version\n`);
      this.remove(ptxOld);
      this.addUnchecked(hash, tx);
    }
    if (ptxOld) {
      EraseFromWallets(ptxOld.GetHash());
    }
    console.log(`CTxMemPool::accept() : accepted ${hash.ToString().substr(0,10)} (poolsz ${mapTx.length})`);
    return true;
  }
  addUnchecked(hash, tx) {
    mapTx[hash] = tx;
    for (let i = 0; i < tx.vin.length; i++) {
      mapNextTx[tx.vin[i].prevout] = CInPoint(mapTx[hash], i);
    }
    nTransactionsUpdated++;
    return true;
  }
  remove(tx) {
    // LOCK(cs);
    let hash = tx.GetHash();
    if (mapTx[hash]) {
      tx.vin.forEach(function(txin) {
        mapNextTx.erase(txin.prevout);
      });
      mapTx.erase(hash);
      nTransactionsUpdated++;
    }
    return true;
  }
  clear() {
    // LOCK(cs);
    mapTx.clear();
    mapNextTx.clear();
    ++nTransactionsUpdated;
  }
  queryHashes(vtxid) {
    // vtxid.clear();
    vtxid = [ ];
    // LOCK(cs);
    // iterate through mapTx
    for (let i = 0; i < Object.keys(mapTx).length; i++) {
      let key = Object.keys(mapTx)[i];
      vtxid.push(mapTx[key]);
    }
  }
}

module.exports = CTxMemPool;
