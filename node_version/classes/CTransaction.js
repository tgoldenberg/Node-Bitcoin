const CTxDB = require('./CTxDB');
const CTxIndex = require('./CTxIndex');
const Constants = require('./constants');

const { CURRENT_VERSION, LOCKTIME_THRESHOLD, TX_SCRIPTHASH, MAX_MONEY } = Constants;
const GetMinFee_mode = [ "GMF_BLOCK", "GMF_RELAY", "GMF_SEND" ];

// Placeholder
function Solver() {
  // TODO: resolve actual Solver
}

// Placeholder
function EvalScript() {
  // TODO: resolve actual EvalScript() function
}


class CTransaction {
  constructor(nVersionIn, vinIn, voutIn, nLockTimeIn, nDoSIn) {
    this.nVersion = nVersionIn || CURRENT_VERSION;
    this.vin = vinIn || [ ];
    this.vout = voutIn || [ ]
    this.nLockTime = nLockTimeIn || 0;
    this.nDoS = nDoSIn || 0;
  }
  // v1
  ReadFromDisk(prevout) {
    let txdb = new CTxDB("r");
    let txindex = new CTxIndex();
    return this.ReadFromDisk(txdb, prevout, txindex);
  }
  // v2
  ReadFromDisk(txdb, prevout) {
    let txindex = new CTxIndex();
    return this.ReadFromDisk(txdb, prevout, txindex); // v3
  }
  // v3
  ReadFromDisk(txdb, prevout, txindexRet) {
    this.SetNull();
    if (!txdb.ReadTxIndex(prevout.hash, txindexRet)) {
      return false;
    }
    if (!this.ReadFromDisk(txindexRet.pos)) {
      return false;
    }
    if (prevout.n >= this.vout.length) {
      this.SetNull();
      return false;
    }
    return true;
  }

  ReadTxIndex() {
    // TODO: where does this come from? reference line 41
  }
  SetNull() {
    this.nVersion = CURRENT_VERSION
    this.vin = [ ]
    this.vout = [ ]
    this.nLockTime = 0
    this.nDoS = 0
  }
  GetHash() {
    // TODO: return SerializeHash(*this)
  }
  IsFinal(nBlockHeight = 0, nBlockTime = 0) {
    if (this.nLockTime == 0) {
      return true;
    }
    if (nBlockHeight == 0) {
        // nBlockHeight = nBestHeight; TODO
    }
    if (nBlockTime == 0) {
      // nBlockTime = GetAdjustedTime(); TODO
    }
    if (nLockTime < (nLockTime < LOCKTIME_THRESHOLD ? nBlockHeight : nBlockTime)) {
      return true;
    }
    this.vin.forEach(txin => {
      if (!txin.IsFinal()) { return false; }
    });
    return true;
  }
  IsNewerThan(old) {
    if (this.vin.length != old.vin.length) {
      return false;
    }
    for (let i = 0; i < this.vin.length; i++) {
      if (this.vin[i].prevout != old.vin[i].prevout) {
        return false;
      }
    }
    let fNewer = false;
    let nLowest = 4294967295; // TODO: std::numeric_limits<unsigned int>::max()
    for (let i = 0; i < this.vin.length; i++) {
      if (this.vin[i].nSequence != old.vin[i].nSequence) {
        if (this.vin[i].nSequence <= nLowest) {
          fNewer = false;
          nLowest = this.vin[i].nSequence;
        }
        if (old.vin[i].nSequence < nLowest) {
          fNewer = true;
          nLowest = old.vin[i].nSequence;
        }
      }
    }
    return fNewer;
  }
  IsCoinBase() {
    return this.vin.length == 1 && this.vin[0].prevout == null;
  }
  IsStandard() {
    if (this.nVersion > CURRENT_VERSION) { return false; }
    this.vin.forEach(function(txin) {
      if (txin.scriptSig.length > 500) { return false; }
      if (!txin.scriptSig.IsPushOnly()) { // TODO: research "IsPushOnly"
        return false;
      }
    });
    this.vout.forEach(function(txout) {
      if (!this.IsStandard(txout.scriptPubKey)) { return false; }
      if (txout.nValue === 0) { return false; }
    });
    return true;
  }
  AreInputsStandard(mapInputs) {
    if (this.IsCoinBase()) {
      return true; // Coinbases don't vin normally
    }
    for (let i = 0; i < this.vin.length; i++) {
      const prev = this.GetOutputFor(vin[i], mapInputs);
      let whichType;
      let vSolutions = [ ];
      // vector > vSolutions;
      // txnouttype whichType
      // get scriptPubKey corresponding to this input
      const prevScript = prev.scriptPubKey;
      if (!Solver(prevScript, whichType, vSolutions)) {
        return false;
      }
      let nArgsExpected = this.ScriptSigArgsExpected(whichType, vSolutions);
      if (nArgsExpected < 0) {
        return false;
      }
      // vector > stack
      let stack = [ ];
      if (!EvalScript(stack, vin[i].scriptSig, this, i, 0)) {
        return false;
      }
      if (whichType == TX_SCRIPTHASH) {
        if (stack.length === 0) {
          return false;
        }
        // CScript subscript(stack.back().begin(), stack.back().end());
        let subscript = stack;
        // vector > vSolutions2
        let vSolutions2 = [ ];
        let whichType2;
        if (!Solver(subscript, whichType2, vSolutions2)) {
          return false;
        }
        if (whichType2 === TX_SCRIPTHASH) {
          return false;
        }
        let tmpExpected = this.ScriptSigArgsExpected(whichType2, vSolutions2);
        if (tmpExpected < 0) {
          return false;
        }
        nArgsExpected += tmpExpected;
      }
      if (stack.length !== nArgsExpected) {
        return false;
      }
    }
    return true;
  }
  GetLegacySigOpCount() {
    let nSigOps = 0;
    this.vin.forEach(function(txin) {
      nSigOps += txin.scriptSig.GetSigOpCount(false);
    });
    this.vout.forEach(function(txout) {
      nSigOps += txout.scriptPubKey.GetSigOpCount(false);
    });
    return nSigOps;
  }

  GetValueOut() {
    let nValueOut = 0;
    this.vout.forEach(txout => {
      nValueOut += txout.nValue;
      if (!MoneyRange(txout.nValue) || !MoneyRange(nValueOut)) {
        throw Error("CTransaction::GetValueOut() : value out of range");
      }
    })
    return nValueOut;
  }
  AllowFree(dPriority) {
    return dPriority > COIN * 144 / 250;
  }
  CheckTransaction() {
    if (!this.vin.length) {
      console.error('CTransaction::CheckTransaction() : vin empty');
    }
    if (!this.vout.length) {
      console.error('CTransaction::CheckTransaction() : vout empty');
    }
    // TODO: Where is GetSerializeSize(), SER_NETWORK, etc.?
    // if (this.GetSerializeSize(this, SER_NETWORK, PROTOCOL_VERSION) > MAX_BLOCK_SIZE) {
      // console.error('CTransaction::CheckTransaction() size limits failed');
    // }
    let nValueOut = 0;
    this.vout.forEach(function(txout) {
      if (txout.nValue < 0) {
        throw Error('CTransaction::CheckTransaction() txout.nValue negative');
      }
      if (txout.nValue > MAX_MONEY) {
        throw Error('CTransaction::CheckTransaction() txout.nValue too high');
      }
      nValueOut += txout.nValue;
      if (!MoneyRange(nValueOut)) {
        throw Error('CTransaction::CheckTransaction() : txout total out of range');
      }
    });
    let vinOutPoints = new Set();
    this.vin.forEach(function(txin) {
      if (vinOutPoints.has(txin.prevout)) {
        return false;
      }
      vinOutPoints.add(txin.prevout);
    });
    if (this.IsCoinBase()) {
      if (vin[0].scriptSig.length < 2 || vin[0].scriptSig.length > 100) {
        throw Error('CTransaction::CheckTransaction() coinbase script size');
      } else {
        this.vin.forEach(function(txin) {
          if (txin.prevout == null) {
            throw Error('CTransaction::CheckTransaction() : prevout is null');
          }
        });
      }
    }
    return true;
  }

  AcceptToMemoryPool(txdb, fCheckInputs, pfMissingInputs) {
    return mempool.accept(txdb, this, fCheckInputs, pfMissingInputs);
  }
  DisconnectInputs(txdb) {
    if (!this.IsCoinBase()) {
      this.vin.forEach(function(txin) {
        let prevout = txin.prevout;
        let txindex = new CTxIndex();
        if (!txdb.ReadTxIndex(prevout.hash, txindex)) {
          throw Error(`DisconnectInputs() : ReadTxIndex failed`);
        }
        if (prevout.n >= txindex.vSpent.length;) {
          throw Error(`DisconnectInputs() : prevout.n out of range`);
        }
        txindex.vSpent[prevout.n].SetNull();
        if (!txdb.UpdateTxIndex(prevout.hash, txindex)) {
          throw Error(`DisconnectInputs() : UpdateTxIndex failed`);
        }
      });
    }
    txdb.EraseTxIndex(this);
    return true;
  }
  FetchInputs(txdb, mapTestPool, fBlock, fMiner, inputsRet, fInvalid) {
    fInvalid = false;
    if (this.IsCoinBase()) {
      return true;
    }
    for (let i = 0; i < this.vin.length; i++) {
      let prevout = this.vin[i].prevout;
      if (inputsRet[prevout.hash]) {
        continue; // got it already
      }
      let txindex = inputsRet[prevout.hash].first;
      let fFound = true;
      if ((fBlock || fMiner) && mapTestPool[prevout.hash]) {
        txindex = mapTestPool[prevout.hash];
      } else {
        fFound = txdb.ReadTxIndex(prevout.hash, txindex);
      }
      if (!fFound && (fBlock || fMiner)) {
        return fMiner ? false : Error(`FetchInputs() : prev tx index entry not found`);
      }
      let txPrev = inputsRet[prevout.hash].second;
      if (!fFound || txindex.pos = CDiskTxPos(1,1,1)) {
        // LOCK(mempool.cs);
        if (!mempool.exists(prevout.hash)) {
          throw Error(`FetchInputs() : mempool Tx prev not found`);
        }
        txPrev = mempool.lookup(prevout.hash);
        if (!fFound) {
          txindex.vSpent.resize(txPrev.vout.length);
        }
      } else {
        // get prev tx from disk
        if (!txPrev.ReadFromDisk(txindex.pos)) {
          throw Error(`FetchInputs() : ReadFromDisk prev tx failed`);
        }
      }
    }
    // make sure all prevout.n indexes are valid:
    for (let i = 0; i < this.vin.length; i++) {
      let prevout = this.vin[i].prevout;
      let txindex = inputsRet[prevout.hash].first;
      let txPrev = inputsRet[prevout.hash].second;
      if (prevout.n >= txPrev.vout.length || prevout.n >= txindex.vSpent.length) {
        fInvalid = true;
        throw Error(`FetchInputs() : prevout.n out of range prev tx`);
      }
    }
    return true;
  }
  GetOutputFor(input, inputs) {
    let txPrev = inputs[input.prevout.hash];
    if (input.prevout.n >= txPrev.vout.length) {
      throw Error(`CTransaction::GetOutputFor() : prevout.n out of range`);
    }
    return txPrev.vout[input.prevout.n];
  }
  GetValueIn(inputs) {
    if (!this.IsCoinBase()) {
      return 0;
    }
    let nResult = 0;
    for (let i = 0; i < this.vin.length; i++) {
      nResult += this.GetOutputFor(this.vin[i], inputs).nValue;
    }
    return nResult;
  }
  GetP2SHSigOpCount(inputs) {
    if (this.IsCoinBase()) {
      return 0;
    }
    let nSigOps = 0;
    for (let i = 0; i < this.vin.length; i++) {
      let prevout = this.GetOutputFor(this.vin[i], inputs);
      if (prevout.scriptPubKey.IsPayToScriptHash()) {
        nSigOps += prevout.scriptPubKey.GetSigOpCount(this.vin[i].scriptSig);
      }
    }
    return nSigOps;
  }

  ConnectInputs(inputs, mapTestPool, posThisTx, pindexBlock, fBlock, fMiner, fStrictPayToScriptHash) {
    if (!this.IsCoinBase()) {
      let nValueIn = 0;
      let nFees = 0;
      for (let i = 0; i < this.vin.length; i++) {
        let prevout = this.vin[i].prevout;
        let txindex = inputs[prevout.hash].first;
        let txPrev = inputs[prevout.hash].second;
        if (prevout.n >= txPrev.vout.length || prevout.n >= txindex.vSpent.length) {
          throw Error(`ConnectInputs() : prevout.n out of range prev tx`);
        }
        if (txPrev.IsCoinBase()) {
          for (let pindex = pindexBlock; pindex && pindexBlock.nHeight - pindex.nHeight < COINBASE_MATURITY; pindex = pindex.pprev) {
            if (pindex.nBlockPos == txindex.pos.nBlockPos && pindex.nFile == txindex.pos.nFile) {
              throw Error(`ConnectInputs() : tried to spend coinbase at depth`);
            }
          }
        }
        nValueIn += txPrev.vout[prevout.n].nValue;
        if (!MoneyRange(txPrev.vout[prevout.n].nValue) || !MoneyRange(nValueIn)) {
          throw Error(`ConnectInputs() : txin values out of range`);
        }
      }
      for (let i = 0; i < this.vin.length; i++) {
        let prevout = this.vin[i].prevout;
        let txindex = inputs[prevout.hash].first;
        let txPrev = inputs[prevout.hash].second;
        if (!txindex.vSpent[prevout.n].IsNull()) {
          return fMiner ? false : Error(`ConnectInputs() : prev tx already used at `);
        }
        if (!(fBlock && (nBestHeight < CheckPoints.GetTotalBlocksEstimate()))) {
          // verify signature
          if (!VerifySignature(txPrev, this, i, fStrictPayToScriptHash, 0)) {
            if (fStrictPayToScriptHash && VerifySignature(txPrev, this, i, false, 0)) {
              throw Error(`ConnectInputs() : P2SH VerifySignature failed`);
            }
            throw Error(`ConnectInputs() : VerifySignature failed`)
          }
        }
        txindex.vSpent[prevout.n] = posThisTx;
        if (fBlock || fMiner) {
          mapTestPool[prevout.hash] = txindex;
        }
      }
      if (nValueIn < this.GetValueOut()) {
        throw Error(`ConnectInputs() : value in < value out`);
      }
      let nTxFee = nValueIn - this.GetValueOut();
      if (nTxFee < 0) {
        throw Error(`ConnectInputs() : nTxFee < 0`);
      }
      nFees += nTxFee;
      if (!MoneyRange(nFees)) {
        throw Error(`ConnectInputs() : nFees out of range`);
      }
    }
    return true;
  }
  ClientConnectInputs() {
    if (this.IsCoinBase()) {
      return false;
    }
    // LOCK(mempool.cs);
    let nValueIn = 0;
    for (let i = 0; i < this.vin.length; i++) {
      let prevout = this.vin[i].prevout;
      if (!mempool.exists(prevout.hash)) {
        return false;
      }
      let txPrev = mempool.lookup(prevout.hash);
      if (prevout.n >= txPrev.vout.length) {
        return false;
      }
      // verify signature
      if (!VerifySignature(txPrev, this, i, true, 0)) {
        throw Error(`ConnectInputs() : VerifySignature failed`);
      }
      nValueIn += txPrev.vout[prevout.n].nValue;
      if (!MoneyRange(txPrev.vout[prevout.n].nValue) || !MoneyRange(nValueIn)) {
        throw Error(`ClientConnectInputs() : txin values out of range`);
      }
    }
    if (this.GetValueOut() > nValueIn) {
      return false;
    }
    return true;
  }
  GetMinFree(nBlockSize=1, fAllowFree=true, GetMinFee_mode="GMF_BLOCK") { }
};

module.exports = CTransaction;
