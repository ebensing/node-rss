# node-rss

A simple node.js RSS feed builder

## Why another RSS module?

None of the other node.js RSS modules that I could find supported the flexibility that I wanted or were too slow. Additionally, many of them seemed overly complex when all we're doing here is building a RSS feed. Not rocket science.

## Install

    npm install node-rss

## Requirements

Node.js 20 or newer. node-rss has **no dependencies** - it builds the feed XML
directly, so there is no native module to compile and nothing to install beyond
the package itself.

## Usage
```javascript
    // this exposes two methods: createNewFeed and getFeedXML
    const rss = require('node-rss');
    // ESM works too: import { createNewFeed, getFeedXML } from 'node-rss';

    // first we create a "feed" object that will define your feed
    // method signature: function createNewFeed(title, link, desc, author, feedLink, options)
    // title : title of your feed
    // link : link to your website
    // desc : description of your feed
    // author : author of the feed
    // feedLink : link to the feed
    // options : additional options, explained below
    const feed = rss.createNewFeed('Blog Most Recent', 'http://someurl.com/',
                                'Most recent blog entries from blog',
                                'EJ Bensing',
                                'http://someurl.com/rss/MostRecent.xml',
                                {'CustomTag' : 'This is a custom tag under the channel tag!' });

    // the additional options parameter can essentially be used to
    // arbitrarily change the xml that will be created or other defaults.
    // currently, it only supports basic tags, where it will take a
    // key : value and turn it into <key>value</key>, but future releases
    // will contain the ability to specify attributes

    //next, we need to add some items to the feed
    // create some dummy data to loop over...
    const blogs = [
      {title: 'blog post 1', url : 'http://someurl.com/blog1', pubDate : new Date(), description: 'this is a description' },
      {title: 'blog post 2', url : 'http://someurl.com/blog2', pubDate : new Date(), description: 'this is a description' },
      {title: 'blog post 3', url : 'http://someurl.com/blog3', pubDate : new Date(), description: 'this is a description' },
      {title: 'blog post 4', url : 'http://someurl.com/blog4', pubDate : new Date(), description: 'this is a description' },
      {title: 'blog post 5', url : 'http://someurl.com/blog5', pubDate : new Date(), description: 'this is a description' },
      {title: 'blog post 6', url : 'http://someurl.com/blog6', pubDate : new Date(), description: 'this is a description' },
    ];


    // add some items to the feed
    // each feed object has a function addNewItem which should be used for adding new items
    // method signature : function addNewItem(itemTitle, itemLink, pubDate, description, fields)
    // itemTitle : Title of the item
    // itemLink : Link to the item
    // pubDate : Date the item was created/published
    // description : description of item
    // fields : functions exactly like the "options" parameter of createNewFeed,
    // allows the user to add arbitrary tags to an item
    for (const blog of blogs) {
        feed.addNewItem(blog.title, blog.url, blog.pubDate, blog.description, {});
    }

    // now to get the XML simply call the getFeedXML function
    const xmlString = rss.getFeedXML(feed);
```
## Other

The "feed" object has a defaults property. Inside this is a dictionary of default values.

    cdata : a list of tag names whose content should be "escaped" in CDATA tags

`pubDate` and `lastBuildDate` accept a `Date` and are written as RFC-1123
strings, which is the format RSS readers expect.

## Escaping and validation

node-rss escapes everything it writes, so feed content taken from user input
cannot break out of the document:

- text is XML-escaped, and CDATA-wrapped content has any `]]>` sequence split
  so it cannot terminate the section early
- attribute values additionally escape quotes and literal newlines
- characters that XML 1.0 cannot represent (most control characters, unpaired
  surrogates) are stripped
- tag names come from your option/field keys, and an element name cannot be
  escaped - so a key that is not a valid XML name is rejected with an error,
  as are keys that would overwrite the feed API (`items`, `defaults`,
  `feedLink`, `addNewItem`) or the prototype chain (`__proto__`, `constructor`,
  `prototype`)

## Tests

    npm test

The suite runs on the built-in `node:test` runner, so there is nothing to install.

## TODO

    - add support for attributes on custom tags
    - add some express.js middleware
    - ?? give me suggestions

## License

MIT - see [LICENSE](LICENSE).

## Change log

Version 2.0.0

  **Breaking:** requires Node.js 20 or newer.

    - Removed the libxmljs dependency. It carried unpatched critical
      advisories (GHSA-773h-w45w-f2f9, GHSA-mg49-jqgw-gcj6,
      GHSA-6433-x5p4-8jc7, GHSA-jv72-59wq-8rxm) with no fixed version
      available, and it requires a node-gyp/libxml2 native build against a
      release pinned to the Node 4 era. The feed XML is now built directly,
      so node-rss has zero dependencies.
    - Fixed a CDATA injection: a `]]>` sequence in a title or description
      could terminate the CDATA section early and inject arbitrary XML.
    - Custom tag names are now validated as XML names instead of being
      written verbatim, and keys that would clobber the feed API or the
      prototype chain are rejected.
    - Characters that XML cannot represent are stripped instead of producing
      a malformed document.
    - `Date` values are written as RFC-1123 (matching `lastBuildDate`) rather
      than JavaScript's default date string, which is not valid in RSS.
    - Added a test suite and CI across Node 20, 22 and 24.
    - Relicensed under MIT and added the missing LICENSE file. Previous
      releases declared a bare "BSD" with no license text included.

Version 1.0.5
    - Updated libxml version to 0.15.x to support node.js 4.x (Thanks @dhendo)

Version 1.0.4
    - Updated libxml version to 0.14.x to support compilation on OSX (Thanks @jmathews)

Version 1.0.3
    - update libxml version to 0.13.0
