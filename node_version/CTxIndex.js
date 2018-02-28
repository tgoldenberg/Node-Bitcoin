const CBlock = require('./CBlock');
const BlockMap = require('./BlockMap');

let mapBlockIndex = { };

class CTxIndex {
  constructor(posIn) {
    this.pos = posIn;
    this.vSpent = [ ];
  }
  GetDepthInMainChain() {
    let block = new CBlock();
    if (!block.ReadFromDisk(this.pos.nFile, this.pos.nBlockPos, false)) {
      return 0;
    }
    let pindex = mapBlockIndex.find(block.GetHash());
    if (!pindex || !pindex.IsInMainChain()) {
      return 0;
    }
    return 1 + nBestHeight - pindex.nHeight;
  }
}

module.exports = CTxIndex;
