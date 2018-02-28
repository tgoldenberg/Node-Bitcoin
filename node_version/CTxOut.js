class CTxOut {
  constructor(nValueIn, scriptPubKeyIn) {
    this.nValue = nValue;
    this.scriptPubKey = scriptPubKeyIn;
  }
  GetHash() {
    // TODO: return SerializeHash(*this)
  }
}

module.exports = CTxOut;
