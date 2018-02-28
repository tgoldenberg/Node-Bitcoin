class CDiskTxPos {
  constructor(nFileIn = -1, nBlockPosIn = 0, nTxPosIn = 0) {
    this.nFile = nFileIn;
    this.nBlockPos = nBlockPosIn;
    this.nTxPos = nTxPosIn;
  }
  IsNull() {
    return (this.nFile == -1);
  }
  ToString() {
    if (this.IsNull()) {
      return "null";
    } else {
      return `nFile=${this.nFile}, nBlockPos=${this.nBlockPos}, nTxPos=${this.nTxPos}`
    }
  }
  print() {
    console.log(this.ToString());
  }
}

module.exports = CDiskTxPos;
