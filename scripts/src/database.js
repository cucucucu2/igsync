chrome.promise = new ChromePromise();

const sL = chrome.promise.storage.local;

class Matcher {
  constructor(q, tagged, liked) {
    this.q = q;
    this.regexp = new RegExp(q, 'i');
    this.tagged = tagged;
    this.liked = liked;
  }

  filter(items) {
    return items.filter((item) => {
      let usertags = '';
      if (this.tagged) {
        if (item.usertags && item.usertags.nodes.length) {
          usertags = item.usertags.nodes
            .map(u => (u.user ? u.user.username : '')).join(' ');
        }
        if (item.edge_media_to_tagged_user &&
          item.edge_media_to_tagged_user.edges.length) {
          usertags = item.edge_media_to_tagged_user.edges
            .map(u => u.node.user.username).join(' ');
        }
      }
      const str = item.caption + item.owner.username + item.owner.full_name +
        (item.location ? item.location.name : '') + usertags;
      return ((this.liked && item.viewer_has_liked) || !this.liked) &&
        (this.regexp.test(str) || item.owner.id === this.q);
    });
  }
}

class DB {
  constructor() {
    this.cached = {};
    this.cleanTimer = null;
  }

  cleanCache() {
    clearTimeout(this.cleanTimer);
    this.cleanTimer = setTimeout(() => this.cleanCacheSub(), 60 * 1000);
  }

  cleanCacheSub() {
    const keys = Object.keys(this.cached);
    for (let i = 0; i < keys.length; i += 1) {
      delete this.cached[keys[i]];
    }
  }

  gCached(key, matcher) {
    // Get item with cached result
    let ckey = key || '_all_';
    if (matcher) {
      ckey += matcher.q;
    }
    this.cleanCache();
    if (this.cached[ckey]) {
      return Promise.resolve(this.cached[ckey]);
    }
    return DB.g(key, matcher).then((items) => {
      this.cached[ckey] = items;
      return key ? items[key] : items;
    });
  }

  static g(key, matcher) {
    // Get all items or item with specific key
    if (key === null && localStorage.dates) {
      const dates = JSON.parse(localStorage.dates);
      let res = [];
      return Promise.all(dates.map(e => (
        DB.g(e.key).then((items) => {
          res = res.concat(matcher ? matcher.filter(items) : items);
        })
      ))).then(() => res);
    }
    return sL.get(key)
      .then(items => (key ? items[key] : items));
  }

  static s(kv) {
    // Set an item with {key: value} object
    const key = Object.keys(kv)[0];
    return sL.set(kv)
      .then(() => sL.get(key))
      .then(items => items[key]);
  }

  static rm(key) {
    return sL.remove(key);
  }

  static async deleteItem(key, id) {
    const old = await DB.g(key);
    const newItems = (old || []).filter(item => item.id !== id);
    if (!old || newItems.length === old.length) {
      return;
    }
    const dates = JSON.parse(localStorage.dates);
    const idx = dates.map(e => e.key).indexOf(key);
    if (newItems.length) {
      dates[idx] = { key, count: newItems.length };
      DB.s({ [key]: newItems });
    } else {
      dates.splice(idx, 1);
      DB.rm(key);
    }
    localStorage.dates = JSON.stringify(dates);
  }

  static push(key, oldItems) {
    // Push new items into old list
    let items = oldItems;
    return DB.g(key)
      .then((old) => {
        let updated = 0;
        if (old) {
          const ids = old.map(item => item.id);
          items = items.filter((item) => {
            const oid = ids.indexOf(item.id);
            if (oid === -1) {
              return true;
            } else if (JSON.stringify(item) !== JSON.stringify(old[oid])) {
              old[oid] = item;
              updated += 1;
            }
            return false;
          });
        }
        console.log(`Updated ${updated} & saved ${items.length} in ${key}.`);
        if (updated || items.length) {
          const newItems = (old || []).concat(items);
          if (localStorage.dates) {
            let dates = JSON.parse(localStorage.dates);
            const idx = dates.map(e => e.key).indexOf(key);
            if (idx === -1) {
              dates.unshift({ count: newItems.length, key });
            } else {
              dates[idx] = { key, count: newItems.length };
            }
            dates = dates.sort((a, b) => +b.key - +a.key);
            localStorage.dates = JSON.stringify(dates);
          }
          return DB.s({ [key]: newItems });
        }
        return false;
      });
  }
}

window.DB = DB;
window.Matcher = Matcher;
