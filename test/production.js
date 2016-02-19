var expect = require('expect.js');
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

describe(__filename, function(){
    var p = new P({});

    it('getBasename', function() {
        var href1 = '//img1.febucache.com/f2e/style/all.1234.group.css';
        var basename1 = p.getBasename(href1);
        expect(basename1).to.be('all.1234.group');

        var href2 = '//img1.febucache.com/f2e/images/logo.png';
        var basename2 = p.getBasename(href2);
        expect(basename2).to.be('logo');

        var href3 = '//img1.febucache.com/f2e/images/logo.123.png';
        var basename3 = p.getBasename(href3);
        expect(basename3).to.be('logo.123');
    });

    it('updateManifest', function() {
        var resource = {
            src: 'images/p_logo.png',
            dest: '//img1.cahce.febucdn.com/xxx/p_logo.a4b5c6e7e8.png',
            rel: ['style/p_common.css', 'detail.shtml']
        };
        p.updateManifest(resource);

        var manifest1 = p.manifest.filter(function(item) {
            var hasSrc = item.src.length === 1 && item.src[0] === 'images/p_logo.png';
            var hasDest = item.dest === resource.dest;
            return hasSrc && hasDest;
        });

        expect(manifest1.length).to.above(0);

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
        var manifest2 = p.manifest.filter(function(item) {
            return item.rel.length === 3;
        });
        expect(manifest2.length).to.above(0);

        var manifest3 = p.manifest.filter(function(item) {
            return item.rel.indexOf('list.shtml') >= 0;
        });
        expect(manifest2.length).to.above(0);

        p.updateManifest(script1);
        p.updateManifest(script3);
    });

    it('updateManifestHelper', function() {
        var manifest = {
            'images/logo.png': 'images/logo-4x6r2q7t9j.png',
            'style/common.css': 'style/common-3j7x0f1d2n.css'
        }
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
        expect(ret).to.eql(expected);
    });

    it('getGroup', function() {
        var group = '_group="all"';
        var ret = p.getGroup(group);
        expect(ret).to.be('all');
    });

    var headStaticFile = new File({
        base: '/test_project',
        path: '/test_project/inc/head_static.html'
    });
    var patterns = util.getReplacements(p, 'production', headStaticFile);
    
    it('replaceHref', function() {
        var link = '<link rel="stylesheet" href="style/common.css?v=1.0.1" _group="all" />';
        var linkActual = replace.strWithArr(link, patterns);

        var link2 = '<link rel="stylesheet" href="style/index.css" _group="all" />';
        var link2Actual = replace.strWithArr(link2, patterns);

        var doc = _.find(p.manifest, function(item) {
            return (item._group === 'all') && (item._type === 'css') && _.contains(item.rel, P._debug.getRelative(headStaticFile));
        });

        expect(doc._group).to.be('all');
        expect(doc.src).to.eql(['style/common.css', 'style/index.css']);
    });

    it('replaceHref: absolute path', function() {
        var link = '<link rel="stylesheet" _group="all" href="/css/common.css">';
        var linkActual = replace.strWithArr(link, patterns);
        expect(linkActual).to.equal(link);
    });

    it('replaceSrc script', function(){
        var script2 = '<script SRC="js/product.js?v=123" _group="all"></script>';
        replace.strWithArr(script2, patterns);

        var script2b = '<script SRC="js/product_two.js?v=11#testhash" _group="all"></script>';
        replace.strWithArr(script2b, patterns);
        
        var doc = _.find(p.manifest, function(item) {
            return (item._group === 'all') && (item._type == 'js') && _.contains(item.rel, P._debug.getRelative(headStaticFile));
        });

        expect(doc._group).to.be('all');
        expect(doc.src).to.eql(['js/product.js', 'js/product_two.js']);

        var script3 = '<script>alert("test");</script>';
        var script3Actual = replace.strWithArr(script3, patterns);
        expect(script3Actual).to.be(script3);

        var script5 = '<script src=""></script>';
        var script5Expected = '<script src=""></script>';
        var script5Actual = replace.strWithArr(script5, patterns);
        expect(script5Actual).to.be(script5Expected);
    });

    it('replaceUrl:background-image', function() {
        var style = '<style>.nav {background-image: url("images/p_logo.png?ver=123");}</style>';
        var expected = '<style>.nav {background-image: url("//img1.cahce.febucdn.com/xxx/p_logo.a4b5c6e7e8.png?ver=123");}</style>';
        var actual = replace.strWithArr(style, patterns);
        expect(actual).to.be(expected);
    });

    it('replaceUrl:background', function() {
        var style = '<style>.nav {background: url("images/p_logo.png");}</style>';
        var expected = '<style>.nav {background: url("//img1.cahce.febucdn.com/xxx/p_logo.a4b5c6e7e8.png");}</style>';
        var actual = replace.strWithArr(style, patterns);
        expect(actual).to.be(expected);
    });

    it('replaceUrl:border-image', function() {
        var style = '<style>.nav {border-image: url("images/p_logo.png");}</style>';
        var expected = '<style>.nav {border-image: url("//img1.cahce.febucdn.com/xxx/p_logo.a4b5c6e7e8.png");}</style>';
        var actual = replace.strWithArr(style, patterns);
        expect(actual).to.be(expected);
    });

    it('replaceUrl:border', function() {
        var style = '<style>.nav {border: url("images/p_logo.png");}</style>';
        var expected = '<style>.nav {border: url("//img1.cahce.febucdn.com/xxx/p_logo.a4b5c6e7e8.png");}</style>';
        var actual = replace.strWithArr(style, patterns);
        expect(actual).to.be(expected);
    });

    it('replaceUrl:sript', function() {
        var script = '<script>var thisUrl = url("?companyId");</script>';
        var actual = replace.strWithArr(script, patterns);
        expect(actual).to.be(script);
    });
});