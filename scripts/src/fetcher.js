const pdelay = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixSrc = (src) => {
  const s = src;
  if (s.match(/\/fr\/|_a\.jpg|s1080/)) {
    return s;
  }
  return s.replace(/c\d+\.\d+\.\d+\.\d+\//, '')
    .replace(/\w\d{3,4}x\d{3,4}\//g, s.match(/\/e\d{2}\//) ? '' : 'e15/');
};

class Fetcher {
  constructor(options) {
    this.base = 'https://www.instagram.com/';
    this.syncEach = options.syncEach;
    this.token = null;
    this.lastCursor = null;
    this.query_id = null;
    this.query_hash = '6305d415e36c0a5f0abb6daba312f2dd';
    this.rhxGis = '';
  }

  getJSON(url) {
    let variables = '';
    if (url.indexOf('variables') > 0) {
      variables = url.slice(url.indexOf('variables') + 10);
    } else {
      variables = `/${url.slice(0, url.indexOf('?'))}`;
    }
    const options = {
      method: 'GET',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'X-Instagram-GIS': md5(`${this.rhxGis}:${variables}`),
      },
      credentials: 'include',
    };
    return fetch(this.base + url, options)
      .then(res => res.json());
  }

  post(url, data) {
    const options = {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-CSRFToken': this.token,
        'X-Instagram-Ajax': 1,
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    };
    if (data) {
      options.body = data;
    }
    return fetch(this.base + url, options)
      .then(res => res.json());
  }

  getDOM(html) {
    let doc;
    if (document.implementation) {
      doc = document.implementation.createHTMLDocument('');
      doc.documentElement.innerHTML = html;
    } else if (DOMParser) {
      doc = (new DOMParser()).parseFromString(html, 'text/html');
    } else {
      doc = document.createElement('div');
      doc.innerHTML = html;
    }
    return doc;
  }

  storeItem(items) {
    const temp = {};
    items.forEach((rawItem) => {
      let item = rawItem;
      if (item.node) {
        item = item.node;
        item.date = item.taken_at_timestamp;
        const caption = item.edge_media_to_caption.edges;
        item.caption = caption.length ? caption[0].node.text : '';
        item.likes = {
          count: item.edge_media_preview_like.count,
        };
        item.comments = {
          count: item.edge_media_to_comment.count,
        };
        item.code = item.shortcode;
        item.display_src = fixSrc(item.display_url);
        const usertags = { nodes: [] };
        if (item.edge_media_to_tagged_user.edges.length) {
          item.edge_media_to_tagged_user.edges.forEach((e) => {
            usertags.nodes.push(e.node);
          });
        }
        item.usertags = usertags;

        item.owner = {
          full_name: item.owner.full_name,
          id: item.owner.id,
          profile_pic_url: item.owner.profile_pic_url,
          username: item.owner.id,
        };
      }
      if (item.__typename === 'GraphSidecar') {
        const display_urls = []; // eslint-disable-line camelcase
        item.edge_sidecar_to_children.edges.forEach((e) => {
          const n = e.node;
          display_urls.push((n.is_video ? (`${n.video_url}|`) : '') +
            fixSrc(n.display_url));
        });
        item.display_urls = display_urls; // eslint-disable-line camelcase
      }
      item.display_src = fixSrc(item.display_src);
      const fields = ['caption', 'code', 'comments', 'date', 'display_src',
        'display_urls', 'video_url', 'id', 'likes', 'location', 'owner',
        'usertags', 'viewer_has_liked'];
      Object.keys(item).forEach((key) => {
        if (fields.indexOf(key) === -1) {
          delete item[key];
        }
      });
      const key = moment(item.date * 1000).startOf('day') / 100000;
      if (key) {
        if (temp[key] === undefined) {
          temp[key] = [];
        }
        temp[key].push(item);
      }
    });
    const newItems = Object.keys(temp).map(key => (DB.push(key, temp[key])));
    return Promise.all(newItems);
  }

  home() {
    return fetch(this.base, { credentials: 'include' })
      .then(res => res.text())
      .then((body) => {
        if (!body) {
          return Promise.reject();
        }
        const doc = this.getDOM(body);
        let s = doc.querySelectorAll('script');
        for (let i = 0; i < s.length; i += 1) {
          if (!s[i].src && s[i].textContent.indexOf('_sharedData') > 0) {
            s = s[i].textContent;
            break;
          }
        }
        const data = JSON.parse(s.match(/({".*})/)[1]);	
        let feed = data.entry_data.FeedPage;
        this.rhxGis = data.rhx_gis;
        if (!feed) {
          return Promise.reject();
        }
        try {
          feed = feed[0].graphql.user.edge_owner_to_timeline_media;
          this.storeItem(feed.edges);
          this.lastCursor = feed.page_info.end_cursor;
        } catch (e) {}
        this.token = data.config.csrf_token;

        let common = doc.querySelector('script[src*="Commons.js"]');
        common = this.base + common.getAttribute('src').slice(1);
        return fetch(common, { credentials: 'include' });
      })
      .then(res => res.text())
      .then((rawBody) => {
        let body = rawBody;
        try {
          body = body.slice(0, body.lastIndexOf('edge_web_feed_timeline'));
          const hash = body.match(/\w="\w{32}",\w="\w{32}",\w="\w{32}"/g);
          this.query_hash = hash[0].slice(3, 35);
        } catch (e) {

        }
        return true;
      });
  }
////////////////////////////////////
feed(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 1807199, //facebook
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '1'});
    });
				}, 2000);
  }
//////////////////////////////////// 
    feed1(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 268161204, //whatsapp
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: '2'});
    });
				}, 6000);
  }
////////////////////////////////////
////////////////////////////////////
    feed2(oldCount, total) {
    let url = null;
	var that = this;
setTimeout(function() {
console.log('Delay')
chrome.browserAction.setBadgeText({text: '3'});
    if (that.query_hash) {
      const data = JSON.stringify({
        id: 25025320, //instagram
		first: that.syncEach,
        after: null,
      });
      url = `hash=${that.query_hash}&variables=${encodeURIComponent(data)}`;
    }
    return that.getJSON(`graphql/query/?query_${url}`).then((body) => {
      const feed = body.data.user.edge_owner_to_timeline_media;
      that.lastCursor = feed.page_info.end_cursor;
      that.storeItem(feed.edges);
      const count = oldCount - 1;
      console.log(`Synced ${total - count}/${total} feed.`);
      chrome.browserAction.setBadgeText({ text: `${total - count}/${total}` });
      if (count > 0 && feed.page_info.has_next_page) {
        return pdelay(1000).then(() => {
          that.feed(count, total);
        });
      }
      return chrome.browserAction.setBadgeText({text: 'Done'});
    });
				}, 10000);
  }
////////////////////////////////////
  auto(count = 10) {
    return this.home().then((res) => {

   if (res) {
////////////////////////////////////		  
		this.feed(count, count);
		this.feed1(count, count);
		this.feed2(count, count);		
////////////////////////////////////
      }
      return res;
    });
  }
}

window.Fetcher = Fetcher;
