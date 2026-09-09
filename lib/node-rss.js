'use strict';

/**
 * node-rss - a simple, dependency-free RSS 2.0 feed builder for node.js
 */

// Properties on a feed object that describe the feed itself rather than a
// channel element, and so are never serialized as XML nodes.
const RESERVED_FEED_KEYS = new Set(['items', 'defaults', 'feedLink', 'addNewItem']);

// Keys that must never be copied from caller-supplied option/field objects,
// because assigning them mutates the prototype chain instead of the object.
const POLLUTING_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// XML 1.0 Name, limited to an optional namespace prefix plus a local name.
// Element names come from caller-supplied object keys, so they are validated
// rather than escaped: there is no way to escape an illegal element name.
const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?$/;

// Characters that are not legal anywhere in an XML 1.0 document. These cannot
// be escaped, only dropped, so they are stripped before serialization.
/* eslint-disable-next-line no-control-regex */
const ILLEGAL_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

// Surrogate code units that are not part of a valid pair are likewise illegal.
const LONE_SURROGATES = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

const INDENT = '  ';

function stripIllegalChars(str) {
  return str.replace(ILLEGAL_XML_CHARS, '').replace(LONE_SURROGATES, '');
}

// Turn an arbitrary value into text suitable for an XML node. Dates become
// RFC-1123 strings, which is what RSS expects for pubDate/lastBuildDate;
// the default `String(date)` form is not a valid RSS date.
function toText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toUTCString();
  }
  return stripIllegalChars(String(value));
}

function escapeText(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeText(str)
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#9;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;');
}

// A CDATA section ends at the first `]]>`, so content containing that sequence
// would otherwise break out of the section and inject arbitrary markup. Split
// the sequence across two sections to neutralize it.
function escapeCdata(str) {
  return str.replace(/]]>/g, ']]]]><![CDATA[>');
}

function assertValidName(name) {
  if (!XML_NAME.test(name)) {
    throw new Error(`node-rss: "${name}" is not a valid XML element name`);
  }
  return name;
}

// Serialize one element. `cdata` selects CDATA-wrapped text over escaped text.
function renderElement(name, value, useCdata, depth, attrs) {
  const pad = INDENT.repeat(depth);
  let open = `<${assertValidName(name)}`;
  for (const [attrName, attrValue] of Object.entries(attrs || {})) {
    open += ` ${assertValidName(attrName)}="${escapeAttr(toText(attrValue))}"`;
  }

  const text = toText(value);
  if (text === '') {
    return `${pad}${open}/>\n`;
  }
  const body = useCdata ? `<![CDATA[${escapeCdata(text)}]]>` : escapeText(text);
  return `${pad}${open}>${body}</${name}>\n`;
}

// Copy caller-supplied tags onto a target object, refusing keys that would
// clobber the feed/item API or poison the prototype chain.
function assignCustomFields(target, source, reserved) {
  if (!source || typeof source !== 'object') {
    return target;
  }
  for (const key of Object.keys(source)) {
    if (POLLUTING_KEYS.has(key)) {
      throw new Error(`node-rss: "${key}" is not an allowed tag name`);
    }
    if (reserved.has(key)) {
      throw new Error(`node-rss: "${key}" is reserved and cannot be used as a tag name`);
    }
    assertValidName(key);
    target[key] = source[key];
  }
  return target;
}

/**
 * Create a feed object that items can be added to.
 *
 * @param {string} title title of the feed
 * @param {string} link link to the website
 * @param {string} desc description of the feed
 * @param {string} author author of the feed
 * @param {string} feedLink link to the feed itself
 * @param {Object} [options] additional channel-level tags, as key/value pairs
 * @returns {Object} the feed
 */
exports.createNewFeed = function createNewFeed(title, link, desc, author, feedLink, options) {
  const feed = {
    title,
    link,
    description: desc,
    defaults: { author, cdata: ['description', 'title'] },
    items: [],
    language: 'en-US',
    feedLink,
  };

  // Non-enumerable so it is not mistaken for a channel tag, while still
  // being callable exactly as before.
  Object.defineProperty(feed, 'addNewItem', {
    enumerable: false,
    writable: true,
    configurable: true,
    value: function addNewItem(itemTitle, itemLink, pubDate, description, fields) {
      const item = {
        title: itemTitle,
        link: itemLink,
        pubDate,
        description,
        guid: itemLink,
        author: this.defaults.author,
      };
      assignCustomFields(item, fields, new Set());
      this.items.push(item);
      return item;
    },
  });

  assignCustomFields(feed, options, RESERVED_FEED_KEYS);

  return feed;
};

/**
 * Serialize a feed object to an RSS 2.0 XML string.
 *
 * @param {Object} feed a feed built by createNewFeed
 * @returns {string} the feed XML
 */
exports.getFeedXML = function getFeedXML(feed) {
  if (!feed || typeof feed !== 'object') {
    throw new TypeError('node-rss: getFeedXML requires a feed object');
  }

  const defaults = feed.defaults || {};
  const cdataTags = new Set(Array.isArray(defaults.cdata) ? defaults.cdata : []);
  const items = Array.isArray(feed.items) ? feed.items : [];

  const rssAttrs = {
    version: '2.0',
    'xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
    'xmlns:wfw': 'http://wellformedweb.org/CommentAPI/',
    'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
    'xmlns:atom': 'http://www.w3.org/2005/Atom',
    'xmlns:sy': 'http://purl.org/rss/1.0/modules/syndication/',
    'xmlns:slash': 'http://purl.org/rss/1.0/modules/slash/',
  };

  let xml = '<?xml version="1.0" encoding="utf-8"?>\n<rss';
  for (const [name, value] of Object.entries(rssAttrs)) {
    xml += ` ${name}="${escapeAttr(value)}"`;
  }
  xml += '>\n' + INDENT + '<channel>\n';

  for (const key of Object.keys(feed)) {
    if (RESERVED_FEED_KEYS.has(key)) {
      continue;
    }
    xml += renderElement(key, feed[key], cdataTags.has(key), 2);
  }

  xml += renderElement('atom:link', null, false, 2, {
    href: feed.feedLink,
    rel: 'self',
    type: 'application/rss+xml',
  });
  xml += renderElement('lastBuildDate', new Date(), false, 2);

  for (const item of items) {
    xml += INDENT.repeat(2) + '<item>\n';
    for (const key of Object.keys(item)) {
      xml += renderElement(key, item[key], cdataTags.has(key), 3);
    }
    xml += INDENT.repeat(2) + '</item>\n';
  }

  xml += INDENT + '</channel>\n</rss>\n';
  return xml;
};
