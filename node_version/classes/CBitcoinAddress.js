const CBase58Data = require('./CBase58Data');

class CBitcoinAddress extends CBase58Data {
  constructor(dest) {
    this.enum = {
      PUBKEY_ADDRESS: 0,
      SCRIPT_ADDRESS: 5,
      PUBKEY_ADDRESS_TEST: 111,
      SCRIPT_ADDRESS_TEST: 196
    };
    this.Set(dest);

  }
  Set(id) { } // CKeyID
  Set(id) { } // CScriptID
  Set(dest) { } // CTxDestination
  IsValid() { }
  Get() { }
  GetKeyID(keyID) { }
}
