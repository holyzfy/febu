var should = require('should');
var replace = require('frep');
var fs = require('fs');
var path = require('path');
var mongoose = require('mongoose');
var mockgoose = require('mockgoose');
var proxyquire = require('proxyquire');
var File = require('vinyl');
var _ = require('underscore');
var common = require('../module/common.js');
var P = require('../module/production.js');
var Git = require('../module/git.js');
var util = require('../module/util.js');

describe(__filename, function(){
    var project = {
        repo: 'http://github.com/holyzfy/test_repo_url',
        development: {
            web: '//qa.developer.test.com/f2e/test_project/'
        },
        production: {
            web: '//img1.cache.test.com/f2e/test_project/'
        }
    };
    
    var p = new P(project);

    mockgoose(mongoose);
    var db = proxyquire('../module/db.js', { 'mongoose': mongoose });
    p.db = db;

    before(function(done){
        db.open(done);
    });

    /*after(function(done) {
        db.close(done);
    });*/

    it('exist', function(done) {
        p.exist('_a_commit_id', function(err, data) {
            data.should.be.false;
            done();
        });
    });

    it('getBasename', function() {
        var href1 = '//img1.febucache.com/f2e/style/all.1234.group.css';
        p.getBasename(href1).should.be.equal('all.1234.group');

        var href2 = '//img1.febucache.com/f2e/images/logo.png';
        p.getBasename(href2).should.be.equal('logo');

        var href3 = '//img1.febucache.com/f2e/images/logo.123.png';
        p.getBasename(href3).should.be.equal('logo.123');
    });

    it('initManifest', function(done) {
        var resource = {
            repo: p.project.repo,
            src: ['images/p_btn.png'],
            dest: '//img1.cahce.febucdn.com/xxx/p_btn.a1b2c3d4e5.png',
            rel: ['style/p_common.css', 'detail.shtml']
        };

        db.resources.save(resource, function(err, newRes) {
            p.initManifest(function(err, docs) {
                docs.should.matchAny(function(item) {
                    item.dest.should.be.equal(resource.dest);
                    p.manifest.length.should.be.above(0);
                    db.resources.remove(resource, done);
                });
            });
        });
    });

    it('updateManifest', function() {
        var resource = {
            src: 'images/p_logo.png',
            dest: '//img1.cahce.febucdn.com/xxx/p_logo.a4b5c6e7e8.png',
            rel: ['style/p_common.css', 'detail.shtml']
        };
        p.updateManifest(resource);
        p.manifest.should.matchAny(function(item) {
            should.deepEqual(item.src, ['images/p_logo.png']);
            item.repo.should.equal(p.project.repo);
            item.dest.should.equal(resource.dest);
            item._status.should.equal('dirty');
        });

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
        p.manifest.should.matchAny(function(item) {
            item.rel.length.should.equal(3);
            item.rel.should.matchAny('list.shtml');
        });

        p.updateManifest(script1);
        p.updateManifest(script3);
    });

    it('serializeManifest', function(done) {
        var resource = {
            src: ['images/p_book.png'],
            dest: '//img1.cahce.febucdn.com/xxx/p_book.c8s5a7h1k3.png',
            rel: ['book.shtml']
        };
        
        p.updateManifest(resource);

        p.serializeManifest(function(err){
            should.not.exist(err);
            var conditions = {
                src: {
                    '$in': ['images/p_book.png', 'images/p_logo.png']
                }
            };
            p.db.resources.find(conditions, function(err, docs) {
                docs.length.should.equal(2);
                docs[0].should.not.have.property('_status');
                db.resources.remove(docs, done);
            });
        });
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
                repo: p.project.repo,
                src: ['images/logo.png'],
                dest: '//img1.cache.test.com/f2e/test_project/images/logo-4x6r2q7t9j.png',
                _status: 'dirty'

            },
            {
                repo: p.project.repo,
                src: ['style/common.css'],
                dest: '//img1.cache.test.com/f2e/test_project/style/common-3j7x0f1d2n.css',
                _status: 'dirty'
            }
        ];

        p.initManifest(function(err, docs) {
            should.not.exist(err);
            var ret = p.updateManifestHelper(file, 'utf-8');
            should.deepEqual(ret, expected);
        });
    });

    it('getGroup', function() {
        var group = '_group="all"';
        var ret = p.getGroup(group);
        should.equal(ret, 'all');
    });

    var headStaticFile = new File({
        base: '/test_project',
        path: '/test_project/inc/head_static.html'
    });
    var patterns = util.getReplacements(p, 'production', headStaticFile);
    
    it('replaceHref', function() {
        var link = '<link rel="stylesheet" href="style/common.css" _group="all" />';
        var linkActual = replace.strWithArr(link, patterns);

        var link2 = '<link rel="stylesheet" href="style/index.css" _group="all" />';
        var link2Actual = replace.strWithArr(link2, patterns);

        var doc = _.find(p.manifest, function(item) {
            return (item._group === 'all') && (item._type === 'css') && _.contains(item.rel, P._debug.getRelative(headStaticFile));
        });

        should.equal(doc._group, 'all');
        should.deepEqual(doc.src, ['style/common.css', 'style/index.css']);
    });

    it('replaceSrc script', function(){
        var script2 = '<script SRC="js/product.js" _group="all"></script>';
        var script2Expected = '<script src="//img1.cache.test.com/f2e/test_project/js/all-77fc0b9010.js"></script>';
        var script2Actual = replace.strWithArr(script2, patterns);

        var script2b = '<script SRC="js/product_two.js" _group="all"></script>';
        var script2bActual = replace.strWithArr(script2b, patterns);

        // console.log('p.manifest=', p.manifest);

        var doc = _.find(p.manifest, function(item) {
            return (item._group === 'all') && (item._type == 'js') && _.contains(item.rel, P._debug.getRelative(headStaticFile));
        });

        should.equal(doc._group, 'all');
        should.deepEqual(doc.src, ['js/product.js', 'js/product_two.js']);

        var script3 = '<script>alert("test");</script>';
        var script3Actual = replace.strWithArr(script3, patterns);
        script3Actual.should.equal(script3);

        var script5 = '<script src=""></script>';
        var script5Expected = '<script src=""></script>';
        var script5Actual = replace.strWithArr(script5, patterns);
        script5Actual.should.equal(script5Expected);
    });

});