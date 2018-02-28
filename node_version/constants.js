const COIN = 100000000;
const MAX_BLOCK_SIZE = 1000000;
const MAX_BLOCK_SIZE_GEN = MAX_BLOCK_SIZE / 2;
const MAX_BLOCK_SIGOPS = MAX_BLOCK_SIZE / 50;
const MAX_ORPHAN_TRANSACTIONS = MAX_BLOCK_SIZE / 100;
const MAX_INV_SZ = 50000;
const MIN_TX_FEE = 50000;
const MIN_RELAY_TX_FEE = 10000;
const MAX_MONEY = 21000000 * COIN;
const CURRENT_VERSION = 1;
const LOCKTIME_THRESHOLD = 500000000; // Tue Nov 5 1985
const TX_SCRIPTHASH = null;
const COINBASE_MATURITY = 100;

module.exports = {
  COIN,
  MAX_BLOCK_SIZE,
  MAX_BLOCK_SIZE_GEN,
  MAX_BLOCK_SIGOPS,
  MAX_ORPHAN_TRANSACTIONS,
  MAX_INV_SZ,
  MIN_TX_FEE,
  MIN_RELAY_TX_FEE,
  MAX_MONEY,
  CURRENT_VERSION,
  LOCKTIME_THRESHOLD,
  TX_SCRIPTHASH,
  COINBASE_MATURITY
};