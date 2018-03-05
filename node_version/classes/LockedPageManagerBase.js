/*
TODO:
what is class Locker ?
what is boost::mutex::scoped_lock
what is class Histogram


*/

class LockedPageManagerBase {
  constructor(page_size) {
    this.page_size = page_size;
    this.page_mask = ~(page_size - 1);
  }
  LockRange(p, size) { }
  UnlockRange(p, size) { }
  GetLockedPageCount() { }
};

module.exports = LockedPageManagerBase;
