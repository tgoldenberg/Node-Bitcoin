const CMerkleTx = require('./CMerkleTx');

class CWalletTx extends CMerkleTx {
  constructor(pwalletIn, arg) {
    super(arg);
    this.pwallet = pwalletIn;
    this.mapValue = { };
    this.vOrderForm = [ ]; // std::vector<std::pair<std::string, std::string> >
    this.fTimeReceivedIsTxTime = 0;
    this.nTimeReceived = 0;
    this.nTimeSmart = 0;
    this.fFromMe = '0';
    this.strFromAccount = '';
    this.nOrderPos = -1;

    this.fDebitCached = false;
    this.fCreditCached = false;
    this.fImmatureCreditCached = false;
    this.fAvailableCreditCached = false;
    this.fWatchDebitCached = false;
    this.fWatchCreditCached = false;
    this.fImmatureWatchCreditCached = false;
    this.fChangeCached = false;
    this.fInMempool = false;
    this.nDebitCached = 0;
    this.nCreditCached = 0;
    this.nImmatureCreditCached = 0;
    this.nAvailableCreditCached = 0;
    this.nWatchDebitCached = 0;
    this.nWatchCreditCached = 0;
    this.nImmatureWatchCreditCached = 0;
    this.nAvailableWatchCreditCached = 0;
    this.nChangeCached =0;
  }
  Init() {
    // re-initialize all class variables
  }
  SerializeOp(s, ser_action) { // Stream, Operation
    if (ser_action.ForRead()) {
      this.Init();
    }
    let fSpent = false;
    if (!ser_action.ForRead()) {
      this.mapValue["fromaccount"] = this.strFromAccount;
      this.WriteOrderPos(this.nOrderPos, this.mapValue);
      if (this.nTimeSmart) {
        this.mapValue["timesmart"] = nTimeSmart;
      }
    }
    // TODO: READWRITE functions
    // READWRITE(*static_cast<CMerkleTx*>(this));
    // std::vector<CMerkleTx> vUnused; //!< Used to be vtxPrev
    // READWRITE(vUnused);
    // READWRITE(mapValue);
    // READWRITE(vOrderForm);
    // READWRITE(fTimeReceivedIsTxTime);
    // READWRITE(nTimeReceived);
    // READWRITE(fFromMe);
    // READWRITE(fSpent);
    if (ser_action.ForRead()) {
      this.strFromAccount = this.mapValue["fromaccount"];
      this.ReadOrderPos(this.nOrderPos, this.mapValue);
      this.nTimeSmart = this.mapValue["timesmart"] ? parseInt(this.mapValue["timesmart"]) : 0;
    }
    delete this.mapValue["fromaccount"];
    delete this.mapValue["spent"];
    delete this.mapValue["n"];
    delete this.mapValue["timesmart"];
  }
  MarkDirty() {
    this.fCreditCached = false;
    this.fAvailableCreditCached = false;
    this.fImmatureCreditCached = false;
    this.fWatchDebitCached = false;
    this.fWatchCreditCached = false;
    this.fAvailableWatchCreditCached = false;
    this.fImmatureWatchCreditCached = false;
    this.fDebitCached = false;
    this.fChangeCached = false;
  }
  BindWallet(pwalletIn) {
    this.pwallet = pwalletIn;
    this.MarkDirty();
  }
  IsFromMe(filter) {
    return this.GetDebit(filter) > 0;
  }
  // v1
  AcceptWalletTransaction(txdb, fCheckInputs) {
    // LOCK(mempool.cs);
    vtxPrev.forEach(function(tx) { // TODO: where is vtxPrev defined?
      if (!tx.IsCoinBase()) {
        let has = tx.GetHash();
        if (!mempool.exists(hash) && !txdb.ContainsTx(hash)) {
          tx.AcceptToMemoryPool(txdb, fCheckInputs);
        }
      }
    });
    return this.AcceptToMemoryPool(txdb, fCheckInputs);
  }
  // v2
  AcceptWalletTransaction() {
    let txdb = new CTxDB("r");
    return this.AcceptWalletTransaction(txdb);
  }
  IsEquivalentTo(tx) { }
  InMempool() { }
  IsTrusted() { }
  GetTxTime() { }
  GetRequestCount() { }
  RelayWalletTransaction(conman) { }
  AcceptToMemoryPool(nAbsurdFee, state) { }
  GetConflicts() { }
  GetDebit(filter) { }
  GetCredit(filter) { }
  GetImmatureCredit(fUseCache=true) { }
  GetAvailableCredit(fUseCache=true) { }
  GetImmatureWatchOnlyCredit(fUseCache=true) { }
  GetAvailableWatchOnlyCredit(fUseCache=true) { }
  GetChange() { }
  GetAmounts(listReceived, listSent, nFee, strSentAccount, filter) { }
}

module.exports = CWalletTx;
