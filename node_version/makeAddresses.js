const bs58 = require('bs58');
const EC = require('elliptic').ec;
const secureRandom = require('secure-random');
const coinstring = require('coinstring');
const eckey = require('eckey');
const RIPEMD160 = require('ripemd160');
const secp256k1 = require('secp256k1');
const coinkey = require('coinkey');
const converter = require('convert-hex');
const crypto = require('crypto');
const sha256 = require('sha256');

const ec = new EC('secp256k1');

const DEFAULT_VERSIONS = { public: 0x0, private: 0x80 };

function Hash(msg) {
  let result = crypto.createHash('sha256').update(msg).digest();
  return new RIPEMD160().update(result).digest();
}

function makeWallet() {
  let privateKey;
  let privateKeyHex;
  let publicKey;
  let publicKeyHex;
  let publicKeyHash;
  let key;
  let privateKeyWIF;
  let publicAddress;
  console.log('> Creating random Private key hex for wallet...');
  privateKey = secureRandom.randomBuffer(32); // start with random 32 bit hex string
  privateKeyHex = privateKey.toString('hex');
  console.log('> Private key created: ', privateKeyHex);

  // generate public key from private
  var keys = ec.keyFromPrivate(privateKeyHex);
  publicKey = keys.getPublic();
  publicKeyHex = keys.getPublic('hex');
  console.log('> Public key created: ', publicKeyHex);

  // generate public key hash
  publicKeyHash = Hash(publicKeyHex);
  console.log('> Public key hash created: ', publicKeyHash.toString('hex'));

  // generate public address
  publicAddress = coinstring.encode(publicKeyHash, DEFAULT_VERSIONS.public);
  console.log('> Public address created: ', publicAddress);

  // generate private key WIF (wallet import format)
  privateKeyWIF = coinstring.encode(privateKey, DEFAULT_VERSIONS.private);
  console.log('> Private key WIF (wallet import format) created : ', privateKeyWIF);

  return key;
}

makeWallet();
module.exports = makeWallet;
