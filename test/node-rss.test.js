'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const rss = require('../lib/node-rss.js');

function makeFeed(options) {
  return rss.createNewFeed(
    'Blog Most Recent',
    'http://someurl.com/',
    'Most recent blog entries',
    'EJ Bensing',
    'http://someurl.com/rss/MostRecent.xml',
    options
  );
}

test('createNewFeed populates the documented defaults', () => {
  const feed = makeFeed();

  assert.equal(feed.title, 'Blog Most Recent');
  assert.equal(feed.link, 'http://someurl.com/');
  assert.equal(feed.description, 'Most recent blog entries');
  assert.equal(feed.feedLink, 'http://someurl.com/rss/MostRecent.xml');
  assert.equal(feed.language, 'en-US');
  assert.equal(feed.defaults.author, 'EJ Bensing');
  assert.deepEqual(feed.defaults.cdata, ['description', 'title']);
  assert.deepEqual(feed.items, []);
  assert.equal(typeof feed.addNewItem, 'function');
});

test('addNewItem records an item with the feed author as a default', () => {
  const feed = makeFeed();
  const when = new Date('2026-01-02T03:04:05Z');
  feed.addNewItem('post 1', 'http://someurl.com/1', when, 'a description');

  assert.equal(feed.items.length, 1);
  assert.deepEqual(feed.items[0], {
    title: 'post 1',
    link: 'http://someurl.com/1',
    pubDate: when,
    description: 'a description',
    guid: 'http://someurl.com/1',
    author: 'EJ Bensing',
  });
});

test('getFeedXML produces a well-formed RSS 2.0 document', () => {
  const feed = makeFeed();
  feed.addNewItem('post 1', 'http://someurl.com/1', new Date(), 'a description');
  const xml = rss.getFeedXML(feed);

  assert.match(xml, /^<\?xml version="1\.0" encoding="utf-8"\?>\n/);
  assert.match(xml, /<rss version="2\.0"/);
  assert.match(xml, /xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom"/);
  assert.match(xml, /<channel>/);
  assert.match(
    xml,
    /<atom:link href="http:\/\/someurl\.com\/rss\/MostRecent\.xml" rel="self" type="application\/rss\+xml"\/>/
  );
  assert.match(xml, /<lastBuildDate>[^<]+<\/lastBuildDate>/);
  assert.match(xml, /<\/channel>\n<\/rss>\n$/);

  // Every opened tag is closed exactly once.
  const opened = xml.match(/<([A-Za-z][\w:.-]*)(?=[\s>/])/g).length;
  const closed = xml.match(/<\/[A-Za-z][\w:.-]*>/g).length;
  const selfClosed = xml.match(/\/>/g).length;
  assert.equal(opened, closed + selfClosed);
});

test('feed-level bookkeeping properties are not serialized as tags', () => {
  const xml = rss.getFeedXML(makeFeed());

  assert.doesNotMatch(xml, /<items/);
  assert.doesNotMatch(xml, /<defaults/);
  assert.doesNotMatch(xml, /<feedLink/);
  assert.doesNotMatch(xml, /<addNewItem/);
});

test('cdata-listed tags are wrapped, others are escaped', () => {
  const feed = makeFeed();
  feed.addNewItem('post & <b>one</b>', 'http://someurl.com/?a=1&b=2', new Date(), 'x');
  const xml = rss.getFeedXML(feed);

  // title and description are in defaults.cdata
  assert.match(xml, /<title><!\[CDATA\[post & <b>one<\/b>\]\]><\/title>/);
  // link is not, so its ampersand must be escaped
  assert.match(xml, /<link>http:\/\/someurl\.com\/\?a=1&amp;b=2<\/link>/);
});

test('markup in non-cdata text is escaped rather than injected', () => {
  const feed = makeFeed();
  feed.addNewItem('t', 'http://x/', new Date(), 'd', {
    'content:encoded': '</item><item><title>injected</title>',
  });
  const xml = rss.getFeedXML(feed);

  assert.match(xml, /&lt;\/item&gt;&lt;item&gt;/);
  assert.equal(xml.match(/<item>/g).length, 1);
  assert.doesNotMatch(xml, /<title>injected<\/title>/);
});

test('a CDATA-terminating sequence cannot break out of its section', () => {
  const feed = makeFeed();
  feed.addNewItem('t', 'http://x/', new Date(), 'safe]]><script>alert(1)</script>');
  const xml = rss.getFeedXML(feed);

  // The payload stays inside CDATA: the raw `]]>` is split, so no bare
  // `<script>` element ever appears in the document.
  assert.doesNotMatch(xml, /\]\]><script>/);
  assert.match(xml, /safe\]\]\]\]><!\[CDATA\[><script>/);

  // The payload created no extra elements: description tags stay balanced
  // (one on the channel, one on the item) and no <script> element exists.
  assert.equal(xml.match(/<description>/g).length, 2);
  assert.equal(xml.match(/<\/description>/g).length, 2);
  assert.equal(xml.match(/<item>/g).length, 1);
});

test('quotes and newlines in attribute values are escaped', () => {
  const feed = rss.createNewFeed(
    't',
    'http://x/',
    'd',
    'a',
    'http://x/feed.xml" onload="alert(1)'
  );
  const xml = rss.getFeedXML(feed);

  assert.match(xml, /href="http:\/\/x\/feed\.xml&quot; onload=&quot;alert\(1\)"/);
  assert.doesNotMatch(xml, /onload="alert/);
});

test('Date values are serialized as RFC-1123, which RSS requires', () => {
  const feed = makeFeed();
  const when = new Date('2026-01-02T03:04:05Z');
  feed.addNewItem('t', 'http://x/', when, 'd');
  const xml = rss.getFeedXML(feed);

  assert.match(xml, /<pubDate>Fri, 02 Jan 2026 03:04:05 GMT<\/pubDate>/);
});

test('an invalid Date serializes as empty rather than "Invalid Date"', () => {
  const feed = makeFeed();
  feed.addNewItem('t', 'http://x/', new Date('nope'), 'd');
  const xml = rss.getFeedXML(feed);

  assert.match(xml, /<pubDate\/>/);
  assert.doesNotMatch(xml, /Invalid Date/);
});

test('characters that XML cannot represent are stripped', () => {
  const illegal = [0x00, 0x08, 0x0b, 0x0c, 0x1f, 0xfffe, 0xffff]
    .map((code) => String.fromCharCode(code))
    .join('');

  const feed = makeFeed();
  feed.addNewItem('t', 'http://x/', new Date(), `bad${illegal}data`, {
    // Tab, newline and carriage return are legal XML and must survive.
    note: 'tab\there\nand\rmore',
  });
  const xml = rss.getFeedXML(feed);

  assert.match(xml, /<!\[CDATA\[baddata\]\]>/);
  assert.match(xml, /<note>tab\there\nand\rmore<\/note>/);
  for (const char of illegal) {
    assert.equal(xml.includes(char), false);
  }
});

test('unpaired surrogates are stripped but valid pairs survive', () => {
  const feed = makeFeed();
  feed.addNewItem('t', 'http://x/', new Date(), 'lone\uD800ok\uDC00 pair\u{1F600}');
  const xml = rss.getFeedXML(feed);

  assert.match(xml, /loneok pair\u{1F600}/u);
  assert.equal(xml.includes('\uD800'), false);
});

test('custom channel tags and item fields are emitted', () => {
  const feed = makeFeed({ CustomTag: 'a custom channel tag', 'dc:creator': 'someone' });
  feed.addNewItem('t', 'http://x/', new Date(), 'd', { category: 'news' });
  const xml = rss.getFeedXML(feed);

  assert.match(xml, /<CustomTag>a custom channel tag<\/CustomTag>/);
  assert.match(xml, /<dc:creator>someone<\/dc:creator>/);
  assert.match(xml, /<category>news<\/category>/);
});

test('tag names that are not valid XML names are rejected', () => {
  for (const bad of ['bad name', 'bad>name', '1leading', 'a:b:c', '<script>', '']) {
    assert.throws(
      () => makeFeed({ [bad]: 'x' }),
      /not a valid XML element name/,
      `expected ${JSON.stringify(bad)} to be rejected`
    );
  }
});

test('prototype-polluting keys are rejected', () => {
  assert.throws(
    () => makeFeed(JSON.parse('{"__proto__": "x"}')),
    /not an allowed tag name/
  );
  assert.throws(() => makeFeed({ constructor: 'x' }), /not an allowed tag name/);

  const feed = makeFeed();
  assert.throws(
    () => feed.addNewItem('t', 'http://x/', new Date(), 'd', JSON.parse('{"prototype": "x"}')),
    /not an allowed tag name/
  );
  assert.equal({}.x, undefined);
});

test('options cannot clobber the feed API', () => {
  for (const key of ['items', 'defaults', 'feedLink', 'addNewItem']) {
    assert.throws(() => makeFeed({ [key]: 'x' }), /is reserved/, `expected ${key} to be rejected`);
  }
});

test('inherited properties on option objects are ignored', () => {
  const parent = { inherited: 'should not appear' };
  const options = Object.create(parent);
  options.own = 'should appear';
  const xml = rss.getFeedXML(makeFeed(options));

  assert.match(xml, /<own>should appear<\/own>/);
  assert.doesNotMatch(xml, /inherited/);
});

test('getFeedXML rejects non-feed input', () => {
  for (const bad of [undefined, null, 'nope', 42]) {
    assert.throws(() => rss.getFeedXML(bad), TypeError);
  }
});

test('getFeedXML tolerates a feed with no items or defaults', () => {
  const xml = rss.getFeedXML({ title: 'bare' });

  assert.match(xml, /<title>bare<\/title>/);
  assert.match(xml, /<\/channel>\n<\/rss>\n$/);
});
