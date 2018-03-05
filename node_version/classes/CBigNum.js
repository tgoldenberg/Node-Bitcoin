// extends BIGNUM (OpenSSL bignum)

class CBigNum {
  constructor(b) {
    BN_init(this);
  }
  setulong(n) { }
  getulong() { }
  getuint() { }
  getint() { }
  setint64(sn) { }
  setuint64(n) { }
  setuint256(n) { }
  getuint256() { }
  setvch(vch) { }
  getvch() { }
  SetCompact(nCompact) { }
  GetCompact() { }
  SetHex(str) { }
};

module.exports = CBigNum;
