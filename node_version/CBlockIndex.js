
class BlockIndex {
  constructor(nFileIn, nBlockPosIn, block) {
    this.phashBlock = null;
    this.pprev = null;
    this.pnext = null;
    this.nFile = nFileIn || 0;
    this.nBlockPos = nBlockPosIn || 0;
    this.nHeight = 0;
    this.bnChainWork = 0;

    this.nVersion = block.nVersion || 0;
    this.hashMerkleRoot = block.hashMerkleRoot || 0;
    this.nTime = block.nTime || 0;
    this.nBits = block.nBits || 0;
    this.nNonce = block.nNonce || 0;
  }
  GetBlockHeader() {
    let block = new CBlock();
    block.nVersion = this.nVersion;
    if (this.pprev) {
      block.hashPrevBlock = this.pprev.GetBlockHash();
    }
    block.hashMerkleRoot = this.hashMerkleRoot;
    block.nTime = this.nTime;
    block.nBits = this.nBits;
    block.nNonce = this.nNonce;
    return block;
  }
  GetBlockHash() {
    return this.phashBlock;
  }
  GetBlockTime() {
    return this.nTime;
  }
  GetBlockWork() {
    let bnTarget = new CBigNum();
    bnTarget.SetCompact(this.nBits);
    if (bnTarget <= 0) {
      return 0;
    }
    return (new CBigNum(1)<<256 / (bnTarget+1));
  }
  IsInMainChain() {
    return pnext || this == pindexBest;
  }
  CheckIndex() {
    return this.CheckProofOfWork(this.GetBlockHash(), this.nBits);
  }
}
