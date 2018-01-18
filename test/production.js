var tape = require('tape');
var replace = require('frep');
var fs = require('fs');
var path = require('path');
var File = require('vinyl');
var sinon = require('sinon');
var _ = require('underscore');
var proxyquire = require('proxyquire');
var common = require('../module/common.js');
var util = require('../module/util.js');
var P = proxyquire('../module/production.js', {
    './util.js': {
        getProjectPublicPath: sinon.stub().returns('//img1.cache.test.com/f2e/test_project/')
    }
});

var p = new P({
    repo: 'https://github.com/xxx/one_project'
});

tape('getBasename', test => {
    var href1 = '//img1.febucache.com/f2e/style/all.1234.group.css';
    var basename1 = p.getBasename(href1);
    test.equal(basename1, 'all.1234.group');

    var href2 = '//img1.febucache.com/f2e/images/logo.png';
    var basename2 = p.getBasename(href2);
    test.equal(basename2, 'logo');

    var href3 = '//img1.febucache.com/f2e/images/logo.123.png';
    var basename3 = p.getBasename(href3);
    test.equal(basename3, 'logo.123');

    test.end();
});

tape('updateManifest:_group', test => {
    var p = new P({
        repo: 'https://github.com/xxx/one_project'
    });
    p.manifest = [
        {
            "src": [
                "js/m_index.js"
            ],
            "dest": "http://examplecdn.com/project/js/m_index-6c4007b7d1.js"
        },
        {
            "src": [
                "js/m_index_b.js"
            ],
            "dest": "http://examplecdn.com/project/js/m_index_b-60e22eea67.js"
        },
        {
            "src": [
                "js/m_index.js",
                "js/m_index_b.js"
            ],
            "_group": "index",
            "_type": "js",
            "rel": [
                "index.shtml"
            ]
        }
    ];

    var doc = {
        "src": [
            "js/m_index.js",
            "js/m_index_b.js"
        ],
        "dest": "http://examplecdn.com/project/js/index-e1a65110fb.js"
    };

    p.updateManifest(doc);
    test.equal(p.manifest[2].dest, 'http://examplecdn.com/project/js/index-e1a65110fb.js');
    test.end();
});

tape('updateManifest', test => {
    var resource = {
        src: 'images/p_logo.png',
        dest: '//img1.cahce.febucdn.com/xxx/p_logo.a4b5c6e7e8.png',
        rel: ['style/p_common.css', 'detail.shtml']
    };
    p.updateManifest(resource);

    var manifest1 = p.manifest.filter(item => {
        var hasSrc = item.src.length === 1 && item.src[0] === 'images/p_logo.png';
        var hasDest = item.dest === resource.dest;
        return hasSrc && hasDest;
    });

    test.ok(manifest1.length);

    var resource2 = {
        src: ['images/p_logo.png'],
        dest: '//img1.cahce.febucdn.com/xxx/p_logo.a4b5c6e7e8.png',
        rel: ['list.shtml']
    };

    var script1 = {
        src: 'js/arttemplate.js',
        dest: '//img1.cache.test.com/f2e/test_project/js/arttemplate-32889a76ed.js',
        rel: ['list.shtml']
    };

    var script3 = {
        src: 'js/help.js',
        dest: '//img1.cache.test.com/f2e/test_project/js/help-0ff25a49f4.js',
        rel: ['help.shtml']
    };
    
    p.updateManifest(resource2);
    var manifest2 = p.manifest.filter(item => {
        return item.rel.length === 3;
    });
    test.ok(manifest2.length);

    var manifest3 = p.manifest.filter(item => {
        return item.rel.indexOf('list.shtml') >= 0;
    });
    test.ok(manifest2.length);

    p.updateManifest(script1);
    p.updateManifest(script3);

    test.end();
});

tape('updateManifestHelper', test => {
    var manifest = {
        'images/logo.png': 'images/logo-4x6r2q7t9j.png',
        'style/common.css': 'style/common-3j7x0f1d2n.css'
    };
    var file = {
        path: 'rev-manifest.json',
        contents: new Buffer(JSON.stringify(manifest))
    };
    var expected = [
        {
            src: ['images/logo.png'],
            dest: '//img1.cache.test.com/f2e/test_project/images/logo-4x6r2q7t9j.png'
        },
        {
            src: ['style/common.css'],
            dest: '//img1.cache.test.com/f2e/test_project/style/common-3j7x0f1d2n.css'
        }
    ];

    var ret = p.updateManifestHelper(file, 'utf-8');
    test.deepEqual(ret, expected);
    test.end();
});

tape('getGroup', test => {
    var group = '_group="all"';
    test.equal(p.getGroup(group), 'all');
    test.end();
});

var headStaticFile = new File({
    base: '/test_project',
    path: '/test_project/inc/head_static.html'
});
var patterns = util.getReplacements(p, 'production', headStaticFile);

tape('replaceHref', test => {
    var link = '<link rel="stylesheet" href="style/common.css?v=1.0.1" _group="all" />';
    var linkActual = replace.strWithArr(link, patterns);

    var link2 = '<link rel="stylesheet" href="style/index.css" _group="all" />';
    var link2Actual = replace.strWithArr(link2, patterns);

    var doc = _.find(p.manifest, item => {
        return (item._group === 'all') && (item._type === 'css') && _.contains(item.rel, P._debug.getRelative(headStaticFile));
    });

    test.equal(doc._group, 'all');
    test.deepEqual(doc.src, ['style/common.css', 'style/index.css']);
    test.end();
});

tape('replaceHref: absolute path', test => {
    var link = '<link rel="stylesheet" href="/style/common.css">';
    var actual = replace.strWithArr(link, patterns);
    var expected = '<link rel="stylesheet" href="//img1.cache.test.com/f2e/test_project/style/common-3j7x0f1d2n.css">';
    test.equal(actual, expected);
    test.end();
});

tape('replaceSrc script', test => {
    var script2 = '<script SRC="js/product.js?v=123" _group="all"></script>';
    replace.strWithArr(script2, patterns);

    var script2b = '<script SRC="js/product_two.js?v=11#testhash" _group="all"></script>';
    replace.strWithArr(script2b, patterns);
    
    var doc = _.find(p.manifest, item => {
        return (item._group === 'all') && (item._type == 'js') && _.contains(item.rel, P._debug.getRelative(headStaticFile));
    });

    test.equal(doc._group, 'all');
    test.deepEqual(doc.src, ['js/product.js', 'js/product_two.js']);

    var script3 = '<script>alert("test");</script>';
    var script3Actual = replace.strWithArr(script3, patterns);
    test.equal(script3Actual, script3);

    var script5 = '<script src=""></script>';
    var script5Expected = '<script src=""></script>';
    var script5Actual = replace.strWithArr(script5, patterns);
    test.equal(script5Actual, script5Expected);

    test.end();
});

tape('replaceSrc script absolute path', test => {
    var script = '<script src="/js/help.js"></script>';
    var actual = replace.strWithArr(script, patterns);
    var expected = '<script src="//img1.cache.test.com/f2e/test_project/js/help-0ff25a49f4.js"></script>';
    test.equal(actual, expected);
    test.end();
});

tape('replaceSrcset', test => {
    p.updateManifest({
        src: 'path/to/large.jpg',
        dest: '//img1.cahce.febucdn.com/xxx/images/large-293kf8u.jpg',
        rel: ['test.html']
    });

    p.updateManifest({
        src: 'path/to/medium.jpg',
        dest: '//img1.cahce.febucdn.com/xxx/images/medium-v7z61m0.jpg',
        rel: ['test.html']
    });

    var testHtml = new File({
        base: '/test_project',
        path: '/test_project/test.html'
    });

    var patterns = util.getReplacements(p, 'production', testHtml);

    var img = `
        <img srcset="path/to/large.jpg 1024w,
                     path/to/medium.jpg 640w,
                     http://xxx.com/path/to/small.jpg 320w"
            src="">`;
    var expected = `
        <img srcset="//img1.cahce.febucdn.com/xxx/images/large-293kf8u.jpg 1024w,
                     //img1.cahce.febucdn.com/xxx/images/medium-v7z61m0.jpg 640w,
                     http://xxx.com/path/to/small.jpg 320w"
            src="">`;
    var actual = replace.strWithArr(img, patterns);
    test.equal(actual, expected);
    test.end();
});

tape('replaceUrl:background-image', test => {
    var style = '<style>.nav {background-image: url("images/p_logo.png?ver=123");}</style>';
    var expected = '<style>.nav {background-image: url("//img1.cahce.febucdn.com/xxx/p_logo.a4b5c6e7e8.png?ver=123");}</style>';
    var actual = replace.strWithArr(style, patterns);
    test.equal(actual, expected);
    test.end();
});

tape('replaceUrl:background-image absolute path', test => {
    var style = '<style>.nav {background-image:url(images/p_logo.png);}</style>';
    var expected = '<style>.nav {background-image:url(//img1.cahce.febucdn.com/xxx/p_logo.a4b5c6e7e8.png);}</style>';
    var actual = replace.strWithArr(style, patterns);
    test.equal(actual, expected);
    test.end();
});

tape('replaceUrl:background', test => {
    var style = '<style>.nav {background: url("images/p_logo.png");}</style>';
    var expected = '<style>.nav {background: url("//img1.cahce.febucdn.com/xxx/p_logo.a4b5c6e7e8.png");}</style>';
    var actual = replace.strWithArr(style, patterns);
    test.equal(actual, expected);
    test.end();
});

tape('replaceUrl:border-image', test => {
    var style = '<style>.nav {border-image: url("images/p_logo.png");}</style>';
    var expected = '<style>.nav {border-image: url("//img1.cahce.febucdn.com/xxx/p_logo.a4b5c6e7e8.png");}</style>';
    var actual = replace.strWithArr(style, patterns);
    test.equal(actual, expected);
    test.end();
});

tape('replaceUrl:border-image absolute path', test => {
    var style = '<style>.nav {border-image: url("/images/p_logo.png");}</style>';
    var expected = '<style>.nav {border-image: url("//img1.cahce.febucdn.com/xxx/p_logo.a4b5c6e7e8.png");}</style>';
    var actual = replace.strWithArr(style, patterns);
    test.equal(actual, expected);
    test.end();
});

tape('replaceUrl:border-image', test => {
    var resource = {
        src: 'images/banner.jpg',
        dest: '//img1.cahce.febucdn.com/xxx/banner.613971c09b.jpg',
        rel: ['style/test.css']
    };
    p.updateManifest(resource);

    var cssFile = new File({
        base: '/test_project',
        path: '/test_project/style/test.css'
    });
    var patterns = util.getReplacements(p, 'production', cssFile);

    var style = '.nav {border-image: url(../images/banner.jpg);}';
    var expected = '.nav {border-image: url(//img1.cahce.febucdn.com/xxx/banner.613971c09b.jpg);}';
    var actual = replace.strWithArr(style, patterns);
    test.equal(actual, expected);
    test.end();
});

tape('replaceUrl:border', test => {
    var style = '<style>.nav {border: url("images/p_logo.png");}</style>';
    var expected = '<style>.nav {border: url("//img1.cahce.febucdn.com/xxx/p_logo.a4b5c6e7e8.png");}</style>';
    var actual = replace.strWithArr(style, patterns);
    test.equal(actual, expected);
    test.end();
});

tape('replaceUrl:sript', test => {
    var script = '<script>var thisUrl = url("?companyId");</script>';
    var actual = replace.strWithArr(script, patterns);
    test.equal(actual, script);
    test.end();
});

tape('replaceUrl:font', test => {
    var eot = {
        src: 'font/fontawesome-webfont.eot',
        dest: '//img1.cahce.febucdn.com/xxx/font/fontawesome-webfont-a247f4358b.eot',
        rel: ['style/test.css']
    };
    p.updateManifest(eot);

    var woff = {
        src: 'font/fontawesome-webfont.woff',
        dest: '//img1.cahce.febucdn.com/xxx/font/fontawesome-webfont-f84ffa8dd9.woff',
        rel: ['style/test.css']
    };
    p.updateManifest(woff);

    var cssFile = new File({
        base: '/test_project',
        path: '/test_project/style/test.css'
    });
    var patterns = util.getReplacements(p, 'production', cssFile);
    var style = '@font-face {src: url("../font/fontawesome-webfont.eot?#iefix&v=4.6.2") format("embedded-opentype"), url("../font/fontawesome-webfont.woff?v=4.6.2") format("woff")}';
    var expected = '@font-face {src: url("//img1.cahce.febucdn.com/xxx/font/fontawesome-webfont-a247f4358b.eot?#iefix&v=4.6.2") format("embedded-opentype"), url("//img1.cahce.febucdn.com/xxx/font/fontawesome-webfont-f84ffa8dd9.woff?v=4.6.2") format("woff")}';
    var actual = replace.strWithArr(style, patterns);
    test.equal(actual, expected);
    test.end();
});
