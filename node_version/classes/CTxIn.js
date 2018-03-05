class CTxIn {
  constructor(prevoutIn, scriptSigIn, nSequenceIn) {
    this.prevout = prevoutIn;
    this.scriptSig = scriptSigIn;
    this.nSequence = nSequenceIn;
  }
  IsFinal() {
    // TODO: nSequence == std::numeric_limits<unsigned int>::max()
  }
}

module.exports = CTxIn;
